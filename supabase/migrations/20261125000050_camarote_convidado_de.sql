-- "Convidado de" nas listas do camarote e reservas na lista da área.
-- Antes, lista_area e lista_camarote só conheciam o anfitrião da própria lista (convidado_de);
-- convidados de alguém de fora (pedidos.anfitriao_externo: credenciado, outro camarote…) apareciam
-- como se fossem o próprio anfitrião. Agora as duas usam os dois tipos, como v_ingressos.

-- ---------------------------------------------------------------- lista da área
-- Colunas novas no fim: reservado_para e anfitriao_externo (muda o tipo de retorno → drop/create).
drop function if exists lista_area(uuid, setor, uuid);
create function lista_area(p_evento uuid, p_setor setor, p_area uuid)
returns table (
  ingresso_id uuid, pedido_id uuid, convite_id uuid, status status_ingresso, preenchido_por preenchido_por,
  nome text, cpf text, celular text, email text, convidado_de_nome text, titular boolean,
  token text, criado_em timestamptz, convite_nome_previsto text, convite_expira_em timestamptz, convite_status status_convite,
  convite_token text, convite_contato text, convite_qtd int, indicacao_de text,
  reservado_para text, anfitriao_externo text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_staff boolean := eh_staff();
begin
  perform _exigir(responde_area(p_area));
  return query
  select i.id, i.pedido_id, i.convite_id, i.status, i.preenchido_por,
         p.nome, case when v_staff then p.cpf else mascarar_cpf(p.cpf) end, p.celular, p.email,
         coalesce(pt.nome, pe.anfitriao_externo), i.convidado_de is null and pe.anfitriao_externo is null, i.token, i.criado_em,
         c.nome_previsto, c.expira_em, c.status, c.token, c.contato, c.qtd_lugares, pe.indicacao_de,
         i.reservado_para, pe.anfitriao_externo
  from ingressos i
  join pedidos pe on pe.id = i.pedido_id
  left join pessoas p on p.id = i.pessoa_id
  left join ingressos t on t.id = i.convidado_de
  left join pessoas pt on pt.id = t.pessoa_id
  left join convites c on c.id = i.convite_id
  where i.evento_id = p_evento and i.setor = p_setor and i.area_id = p_area
  order by i.pedido_id, i.convidado_de nulls first, i.criado_em;
end $$;

-- ---------------------------------------------------------------- lista da porta (check-in / impressão)
create or replace function lista_camarote(p_evento uuid)
returns table (ingresso_id uuid, nome text, cpf_mascarado text, area text, anfitriao text, titular boolean,
               pedido_id uuid, indicacao_de text, chegada_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir(pode_operar());
  return query
  select i.id, p.nome, mascarar_cpf(p.cpf), a.nome,
         coalesce(pt.nome, pe.anfitriao_externo, p.nome), i.convidado_de is null and pe.anfitriao_externo is null,
         i.pedido_id, pe.indicacao_de, i.chegada_em
  from ingressos i
  join pessoas p on p.id = i.pessoa_id
  join areas a on a.id = i.area_id
  join pedidos pe on pe.id = i.pedido_id
  left join ingressos t on t.id = i.convidado_de
  left join pessoas pt on pt.id = t.pessoa_id
  where i.evento_id = p_evento and i.setor = 'camarote'
    and i.status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente')
  order by coalesce(pt.nome, pe.anfitriao_externo, p.nome), i.convidado_de is null and pe.anfitriao_externo is null desc, p.nome;
end $$;
