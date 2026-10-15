-- 1) Sem "jogo concorrido": o camarote é gerido na mão pelo Marketing (quantos lugares há e
--    o que liberar). Nenhum pedido vai mais para a fila de prioridade.
-- 2) Convidados em massa vinculados a um anfitrião: alguém que já está na lista do jogo ou
--    alguém de fora (credenciado, em outro camarote…) — o anfitrião não precisa ocupar lugar.

-- ---------------------------------------------------------------- fim do jogo concorrido
create or replace function _trg_sem_concorrido() returns trigger
language plpgsql as $$
begin
  new.concorrido := false;
  return new;
end $$;
create trigger eventos_sem_concorrido before insert or update on eventos
for each row execute function _trg_sem_concorrido();

update eventos set concorrido = false where concorrido;

-- o que estava parado na fila do camarote sobe se houver lugar (pedidos inteiros, na ordem de chegada)
do $$
declare e record;
begin
  perform _ctx('sistema', 'fim da fila por prioridade: liberado por ordem de chegada');
  for e in select distinct i.evento_id, i.area_id from ingressos i join eventos ev on ev.id = i.evento_id
           where i.setor = 'camarote' and i.status = 'lista_espera' and ev.status in ('aberto', 'fechado') loop
    perform _promover_lista_espera(e.evento_id, 'camarote', e.area_id);
  end loop;
end $$;

-- ---------------------------------------------------------------- anfitrião de fora da lista
alter table pedidos add column anfitriao_externo text check (length(anfitriao_externo) <= 200);

drop view v_ingressos;
create view v_ingressos with (security_invoker = true) as
select i.*, p.nome, p.cpf, p.celular, p.email, a.nome as area_nome, a.ordem as area_ordem,
       coalesce(pt.nome, pe.anfitriao_externo) as convidado_de_nome, pe.indicacao_de, pe.origem, pe.prioridade, pe.catering, pe.centro_custo,
       pe.observacao as pedido_observacao, pe.manual_admin, pe.anfitriao_externo
from ingressos i
join areas a on a.id = i.area_id
join pedidos pe on pe.id = i.pedido_id
left join pessoas p on p.id = i.pessoa_id
left join ingressos t on t.id = i.convidado_de
left join pessoas pt on pt.id = t.pessoa_id;
grant select on v_ingressos to authenticated, service_role;

-- Admin/Marketing: vários convidados de uma vez, todos aprovados, opcionalmente vinculados a um anfitrião
-- p_anfitriao: ingresso de alguém já na lista do jogo; p_anfitriao_externo: nome de quem está fora (credenciado etc.)
create or replace function adicionar_em_massa(p_evento uuid, p_setor setor, p_area uuid, p_pessoas jsonb,
                                              p_anfitriao uuid default null, p_anfitriao_externo text default null,
                                              p_doador uuid default null, p_abater boolean default false, p_opcoes jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_r jsonb;
  v_ext text := limpar_nome(p_anfitriao_externo);
  v_nome_anf text;
  v_ids uuid[];
begin
  perform _exigir(eh_staff());
  perform _exigir(p_anfitriao is null or v_ext is null, 'VALOR_INVALIDO: escolha um anfitrião da lista OU informe um de fora, não os dois');
  if p_anfitriao is not null then
    select p.nome into v_nome_anf from ingressos i join pessoas p on p.id = i.pessoa_id
    where i.id = p_anfitriao and i.evento_id = p_evento
      and i.status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente');
    perform _exigir(found, 'NAO_ENCONTRADO: o anfitrião escolhido não está ativo na lista deste jogo');
  end if;

  v_r := case when p_abater
    then adicionar_abatendo(p_evento, p_setor, p_area, p_doador, p_pessoas, coalesce(p_opcoes, '{}') || '{"origem":"marketing","avulsos":true}')
    else criar_pedido(p_evento, p_setor, p_area, p_pessoas, coalesce(p_opcoes, '{}') || '{"origem":"marketing","avulsos":true}')
  end;
  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(v_r -> 'ingressos') x;
  if p_anfitriao is not null then
    update ingressos set convidado_de = p_anfitriao where id = any (v_ids);
  end if;
  if v_ext is not null then
    update pedidos set anfitriao_externo = v_ext where id = (v_r ->> 'pedido_id')::uuid;
  end if;
  return v_r || jsonb_build_object('anfitriao', coalesce(v_nome_anf, v_ext));
end $$;
revoke execute on function adicionar_em_massa(uuid, setor, uuid, jsonb, uuid, text, uuid, boolean, jsonb) from public, anon;
grant execute on function adicionar_em_massa(uuid, setor, uuid, jsonb, uuid, text, uuid, boolean, jsonb) to authenticated, service_role;

-- Link para os convidados de um anfitrião: qualquer pessoa ativa na lista do jogo (não só titular)
create or replace function criar_convite_anfitriao(p_anfitriao uuid, p_qtd int, p_contato text default null, p_expira_em timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
  v_ev eventos;
  v_conv convites;
  v_expira timestamptz;
begin
  perform _exigir(eh_staff());
  perform _exigir(p_qtd between 1 and 10, 'VALOR_INVALIDO: um convite vale de 1 a 10 lugares');
  select * into v_ing from ingressos where id = p_anfitriao;
  perform _exigir(found, 'NAO_ENCONTRADO: anfitrião não encontrado');
  perform _exigir(v_ing.status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente'),
                  'TRANSICAO_INVALIDA: o anfitrião precisa estar aprovado na lista');
  select * into v_ev from eventos where id = v_ing.evento_id;
  v_expira := coalesce(p_expira_em, v_ev.inicio - interval '1 day');
  perform _exigir(v_expira > now(), 'VALOR_INVALIDO: a validade do convite precisa estar no futuro');
  perform _travar_setor(v_ing.evento_id, v_ing.setor);
  if not _cabe(v_ing.evento_id, v_ing.setor, v_ing.area_id, p_qtd) then
    raise exception 'COTA_EXCEDIDA: não há % vaga(s) livre(s) para a área', p_qtd;
  end if;
  insert into convites (pedido_id, evento_id, setor, area_id, qtd_lugares, nome_previsto, contato, expira_em, criado_por, convidado_de)
  values (v_ing.pedido_id, v_ing.evento_id, v_ing.setor, v_ing.area_id, p_qtd,
          'Convidados de ' || (select nome from pessoas where id = v_ing.pessoa_id), p_contato, v_expira, auth.uid(), v_ing.id)
  returning * into v_conv;
  perform _ctx('usuario', 'vagas reservadas para convidados do anfitrião');
  insert into ingressos (evento_id, setor, area_id, pedido_id, convite_id, convidado_de, status)
  select v_ing.evento_id, v_ing.setor, v_ing.area_id, v_ing.pedido_id, v_conv.id, v_ing.id, 'convite_enviado' from generate_series(1, p_qtd);
  return jsonb_build_object('convite_id', v_conv.id, 'token', v_conv.token, 'expira_em', v_expira);
end $$;

-- Link gerado para convidados de alguém de fora da lista (credenciado etc.)
create or replace function definir_anfitriao_externo(p_convite uuid, p_nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_staff());
  update pedidos set anfitriao_externo = limpar_nome(p_nome)
  where id = (select pedido_id from convites where id = p_convite);
end $$;
revoke execute on function definir_anfitriao_externo(uuid, text) from public, anon;
grant execute on function definir_anfitriao_externo(uuid, text) to authenticated, service_role;
