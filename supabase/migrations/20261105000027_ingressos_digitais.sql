-- Ingressos digitais (shows): a equipe sobe em lote os PDFs ou links dos ingressos, o sistema
-- distribui um por convidado pronto para envio (nominais primeiro, pelo CPF ou nome; depois os
-- genéricos) e a equipe envia em lote: e-mail com "Baixar meu ingresso" + página do convidado.
-- Também: cadastro facial configurável por evento (jogos sim, shows não, por padrão).

alter table eventos
  add column ingressos_digitais boolean,
  add column exige_facial boolean;
update eventos set ingressos_digitais = (tipo = 'show'), exige_facial = (tipo = 'jogo');

-- padrão pelo tipo quando não informado
create or replace function _trg_evento_padroes() returns trigger
language plpgsql as $$
begin
  new.ingressos_digitais := coalesce(new.ingressos_digitais, new.tipo = 'show');
  new.exige_facial := coalesce(new.exige_facial, new.tipo = 'jogo');
  return new;
end $$;
create trigger eventos_padroes before insert or update on eventos
for each row execute function _trg_evento_padroes();
alter table eventos alter column ingressos_digitais set not null, alter column exige_facial set not null;

-- ---------------------------------------------------------------- estoque de ingressos digitais
create table ingressos_digitais (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos (id) on delete cascade,
  setor setor not null,
  tipo text not null check (tipo in ('pdf', 'link')),
  url text check (url is null or url ~* '^https?://'),
  caminho text,                       -- PDF guardado em op_arquivos
  nome_arquivo text,
  titular_nome text,                  -- ingresso nominal (nome)…
  titular_cpf char(11),               -- …e/ou CPF
  ingresso_id uuid unique references ingressos (id) on delete set null,
  atribuido_em timestamptz,
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  check ((tipo = 'link' and url is not null) or (tipo = 'pdf' and caminho is not null))
);
create index ingressos_digitais_evento on ingressos_digitais (evento_id, setor);
alter table ingressos_digitais enable row level security;
create policy ingressos_digitais_ler on ingressos_digitais for select to authenticated using (eh_staff());
grant select on ingressos_digitais to authenticated;

-- nome sem acento/caixa/espaços extras, para casar ingresso nominal × convidado
create or replace function _nome_norm(p text) returns text language sql immutable as $$
  select nullif(regexp_replace(translate(lower(btrim(coalesce(p, ''))),
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '\s+', ' ', 'g'), '')
$$;

-- p_itens: [{tipo, url?, caminho?, nome_arquivo?, titular_nome?, titular_cpf?}]
create or replace function dig_adicionar(p_evento uuid, p_setor setor, p_itens jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform _exigir(eh_staff());
  perform _exigir((select ingressos_digitais from eventos where id = p_evento), 'VALOR_INVALIDO: este evento não usa ingressos digitais (ative no cadastro do evento)');
  insert into ingressos_digitais (evento_id, setor, tipo, url, caminho, nome_arquivo, titular_nome, titular_cpf, criado_por)
  select p_evento, p_setor, i ->> 'tipo', nullif(btrim(i ->> 'url'), ''), i ->> 'caminho', i ->> 'nome_arquivo',
         limpar_nome(i ->> 'titular_nome'), normalizar_cpf(i ->> 'titular_cpf'), auth.uid()
  from jsonb_array_elements(coalesce(p_itens, '[]')) i;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Remove do estoque (só o que ainda não foi enviado). Devolve o caminho do PDF para apagar o arquivo.
create or replace function dig_remover(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v ingressos_digitais;
begin
  perform _exigir(eh_staff());
  select * into v from ingressos_digitais where id = p_id;
  perform _exigir(found, 'NAO_ENCONTRADO: ingresso digital não encontrado');
  perform _exigir(v.enviado_em is null, 'JA_ENVIADO: este ingresso já foi enviado ao convidado');
  delete from ingressos_digitais where id = p_id;
  return v.caminho;
end $$;

create or replace function dig_desatribuir(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_staff());
  perform _exigir(not exists (select 1 from ingressos_digitais where id = p_id and enviado_em is not null), 'JA_ENVIADO: este ingresso já foi enviado ao convidado');
  update ingressos_digitais set ingresso_id = null, atribuido_em = null where id = p_id;
end $$;

-- Distribui: convidados prontos para envio (ou já enviados sem arquivo) recebem um ingresso.
-- 1º nominais pelo CPF, 2º nominais pelo nome, 3º genéricos (sem titular), por ordem de pedido.
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
    from ingressos i join pessoas p on p.id = i.pessoa_id
    where i.evento_id = p_evento and i.status in ('facial_ok', 'enviado', 'confirmado')
      and not exists (select 1 from ingressos_digitais d where d.ingresso_id = i.id)
    order by i.criado_em, i.id
  loop
    v_dig := null;
    select id into v_dig from ingressos_digitais
    where evento_id = p_evento and setor = r.setor and ingresso_id is null and titular_cpf is not null and titular_cpf = r.cpf
    limit 1;
    if v_dig is not null then v_cpf := v_cpf + 1;
    else
      select id into v_dig from ingressos_digitais
      where evento_id = p_evento and setor = r.setor and ingresso_id is null and titular_cpf is null
        and titular_nome is not null and _nome_norm(titular_nome) = r.nome
      limit 1;
      if v_dig is not null then v_nome := v_nome + 1;
      else
        select id into v_dig from ingressos_digitais
        where evento_id = p_evento and setor = r.setor and ingresso_id is null and titular_cpf is null and titular_nome is null
        order by criado_em, id limit 1;
        if v_dig is not null then v_gen := v_gen + 1; end if;
      end if;
    end if;
    if v_dig is null then v_falta := v_falta + 1;
    else update ingressos_digitais set ingresso_id = r.id, atribuido_em = now() where id = v_dig;
    end if;
  end loop;
  return jsonb_build_object('por_cpf', v_cpf, 'por_nome', v_nome, 'genericos', v_gen, 'sem_ingresso', v_falta);
end $$;

-- Cancelado/recusado antes do envio: o ingresso digital volta para o estoque
create or replace function _trg_dig_liberar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('cancelado', 'recusado', 'convite_expirado') and new.status is distinct from old.status then
    update ingressos_digitais set ingresso_id = null, atribuido_em = null where ingresso_id = new.id and enviado_em is null;
  end if;
  return null;
end $$;
create trigger ingressos_z_dig_liberar after update of status on ingressos
for each row execute function _trg_dig_liberar();

-- Depois do e-mail: marca o arquivo como enviado e o ingresso como "Enviado"
create or replace function dig_marcar_enviados(p_ingressos uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform _exigir(eh_staff());
  update ingressos_digitais set enviado_em = coalesce(enviado_em, now()) where ingresso_id = any (p_ingressos);
  get diagnostics v_n = row_count;
  perform marcar_enviados(array(select id from ingressos where id = any (p_ingressos) and status = 'facial_ok'), true);
  return v_n;
end $$;

-- Página do convidado: o ingresso dele, só depois de enviado (acesso pelo token, via servidor)
create or replace function dig_do_token(p_token text)
returns table (tipo text, url text, caminho text, nome_arquivo text)
language sql stable security definer set search_path = public as $$
  select d.tipo, d.url, d.caminho, d.nome_arquivo
  from ingressos i join ingressos_digitais d on d.ingresso_id = i.id
  where i.token = p_token and d.enviado_em is not null and i.status in ('enviado', 'confirmado', 'presente')
$$;

do $$
declare f text;
begin
  foreach f in array array['dig_adicionar(uuid, setor, jsonb)', 'dig_remover(uuid)', 'dig_desatribuir(uuid)',
                           'dig_atribuir(uuid)', 'dig_marcar_enviados(uuid[])'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke execute on function dig_do_token(text) from public, anon, authenticated';
  execute 'grant execute on function dig_do_token(text) to service_role';
end $$;

-- ---------------------------------------------------------------- e-mail com o ingresso
insert into modelos_email (chave, nome, descricao, assunto, corpo) values
('ingresso_digital', 'Ingresso digital (shows)',
 'Enviado pelo botão "Enviar ingressos" nos eventos com ingresso digital (PDF ou link).',
 'Seu ingresso · {{jogo}}',
 'Olá, {{nome}}!

Seu ingresso para {{jogo}} está pronto.

📅 {{quando}}
📍 Arena MRV · {{setor}}
🚪 Portões: {{portoes}}

Clique no botão abaixo para baixar o seu ingresso. Ele é pessoal: não compartilhe o link.

Bom evento!')
on conflict (chave) do nothing;
