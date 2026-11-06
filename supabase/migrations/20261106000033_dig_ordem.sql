-- Ingressos digitais em sequência: o estoque guarda a ordem em que os links/PDFs foram colados
-- (1, 2, 3…) e a distribuição vai área por área (na ordem das áreas), cada uma recebendo os
-- próximos da fila. Antes, links do mesmo lote saíam em ordem aleatória e as áreas se misturavam.

alter table ingressos_digitais add column ordem bigint;

-- o que já existe: pela data e pelo número no fim do link/arquivo (teste-1, teste-2… teste-10)
update ingressos_digitais d set ordem = o.n
from (
  select id, row_number() over (
    order by criado_em,
             coalesce(nullif(substring(coalesce(url, nome_arquivo, '') from '(\d+)\D*$'), '')::numeric, 0),
             coalesce(url, nome_arquivo), id) as n
  from ingressos_digitais
) o
where o.id = d.id;

create sequence ingressos_digitais_ordem_seq owned by ingressos_digitais.ordem;
select setval('ingressos_digitais_ordem_seq', coalesce((select max(ordem) from ingressos_digitais), 0) + 1, false);
alter table ingressos_digitais alter column ordem set default nextval('ingressos_digitais_ordem_seq'),
                               alter column ordem set not null;
create index ingressos_digitais_fila on ingressos_digitais (evento_id, setor, ordem);

-- adicionar mantém a ordem da lista colada
create or replace function dig_adicionar(p_evento uuid, p_setor setor, p_itens jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform _exigir(eh_staff());
  perform _exigir((select ingressos_digitais from eventos where id = p_evento), 'VALOR_INVALIDO: este evento não usa ingressos digitais (ative no cadastro do evento)');
  insert into ingressos_digitais (evento_id, setor, tipo, url, caminho, nome_arquivo, titular_nome, titular_cpf, criado_por)
  select p_evento, p_setor, i ->> 'tipo', nullif(btrim(i ->> 'url'), ''), i ->> 'caminho', i ->> 'nome_arquivo',
         limpar_nome(i ->> 'titular_nome'), normalizar_cpf(i ->> 'titular_cpf'), auth.uid()
  from jsonb_array_elements(coalesce(p_itens, '[]')) with ordinality as t(i, pos)
  order by pos;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Distribui área por área (ordem das áreas), e dentro da área por ordem de pedido.
-- 1º nominais pelo CPF, 2º nominais pelo nome, 3º genéricos na ordem do estoque.
create or replace function dig_atribuir(p_evento uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_dig uuid;
  v_cpf int := 0; v_nome int := 0; v_gen int := 0; v_falta int := 0;
begin
  perform _exigir(eh_staff());
  perform 1 from eventos where id = p_evento for update; -- uma distribuição por vez
  for r in
    select i.id, i.setor, p.cpf, _nome_norm(p.nome) as nome
    from ingressos i
    join pessoas p on p.id = i.pessoa_id
    left join areas a on a.id = i.area_id
    where i.evento_id = p_evento and i.status in ('facial_ok', 'enviado', 'confirmado')
      and not exists (select 1 from ingressos_digitais d where d.ingresso_id = i.id)
    order by coalesce(a.ordem, 2147483647), a.nome, i.criado_em, i.id
  loop
    v_dig := null;
    select id into v_dig from ingressos_digitais
    where evento_id = p_evento and setor = r.setor and ingresso_id is null and titular_cpf is not null and titular_cpf = r.cpf
    order by ordem limit 1;
    if v_dig is not null then v_cpf := v_cpf + 1;
    else
      select id into v_dig from ingressos_digitais
      where evento_id = p_evento and setor = r.setor and ingresso_id is null and titular_cpf is null
        and titular_nome is not null and _nome_norm(titular_nome) = r.nome
      order by ordem limit 1;
      if v_dig is not null then v_nome := v_nome + 1;
      else
        select id into v_dig from ingressos_digitais
        where evento_id = p_evento and setor = r.setor and ingresso_id is null and titular_cpf is null and titular_nome is null
        order by ordem limit 1;
        if v_dig is not null then v_gen := v_gen + 1; end if;
      end if;
    end if;
    if v_dig is null then v_falta := v_falta + 1;
    else update ingressos_digitais set ingresso_id = r.id, atribuido_em = now() where id = v_dig;
    end if;
  end loop;
  return jsonb_build_object('por_cpf', v_cpf, 'por_nome', v_nome, 'genericos', v_gen, 'sem_ingresso', v_falta);
end $$;
