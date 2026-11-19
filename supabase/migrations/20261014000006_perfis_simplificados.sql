-- Perfis simplificados: responsável vê só a própria cota; operação do camarote controla chegadas.

-- ---------------------------------------------------------------- totais do setor só para staff
create or replace function saldo(p_evento uuid, p_setor setor, p_area uuid)
returns table (capacidade int, ocupados_setor int, cota int, ocupados_area int, saldo int, em_espera int, cota_por_area boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_cap int; v_por_area boolean; v_cota int; v_oc_setor int; v_oc_area int; v_staff boolean := eh_staff();
begin
  select es.capacidade, es.cota_por_area into v_cap, v_por_area
  from evento_setores es where es.evento_id = p_evento and es.setor = p_setor;
  if not found then return; end if;
  select c.quantidade into v_cota from cotas c where c.evento_id = p_evento and c.setor = p_setor and c.area_id = p_area;
  v_oc_setor := ocupados(p_evento, p_setor);
  v_oc_area := ocupados(p_evento, p_setor, p_area);
  return query select
    -- responsável de área não enxerga o total do setor, só a própria cota
    case when v_staff or auth.uid() is null then v_cap end,
    case when v_staff or auth.uid() is null then v_oc_setor end,
    v_cota, v_oc_area,
    greatest(0, least(
      v_cap - v_oc_setor,
      case when v_cota is not null then v_cota - v_oc_area
           when v_por_area then 0
           else v_cap - v_oc_setor end
    )),
    (select count(*)::int from ingressos i where i.evento_id = p_evento and i.setor = p_setor and i.area_id = p_area and i.status = 'lista_espera'),
    v_por_area;
end $$;

create or replace function resumo_setores(p_evento uuid)
returns table (setor setor, capacidade int, cota_por_area boolean, alocado int, ocupados int, em_espera int)
language sql stable security definer set search_path = public as $$
  select es.setor, es.capacidade, es.cota_por_area,
         coalesce((select sum(c.quantidade)::int from cotas c where c.evento_id = es.evento_id and c.setor = es.setor), 0),
         ocupados(es.evento_id, es.setor),
         (select count(*)::int from ingressos i where i.evento_id = es.evento_id and i.setor = es.setor and i.status = 'lista_espera')
  from evento_setores es
  where es.evento_id = p_evento and eh_staff()
  order by es.setor
$$;

-- ---------------------------------------------------------------- chegada no camarote (operação)
-- Controle da operação no dia: independente do status do ingresso e do envio.
alter table ingressos add column chegada_em timestamptz, add column chegada_por uuid references perfis (user_id);

create or replace function pode_operar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() in ('admin', 'marketing', 'operacao'), false)
$$;

-- Convidados aprovados do camarote (o que a operação precisa ver na porta)
create or replace function lista_camarote(p_evento uuid)
returns table (ingresso_id uuid, nome text, cpf_mascarado text, area text, anfitriao text, titular boolean,
               pedido_id uuid, indicacao_de text, chegada_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir(pode_operar());
  return query
  select i.id, p.nome, mascarar_cpf(p.cpf), a.nome,
         coalesce(pt.nome, p.nome), i.convidado_de is null, i.pedido_id, pe.indicacao_de, i.chegada_em
  from ingressos i
  join pessoas p on p.id = i.pessoa_id
  join areas a on a.id = i.area_id
  join pedidos pe on pe.id = i.pedido_id
  left join ingressos t on t.id = i.convidado_de
  left join pessoas pt on pt.id = t.pessoa_id
  where i.evento_id = p_evento and i.setor = 'camarote'
    and i.status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente')
  order by coalesce(pt.nome, p.nome), i.convidado_de nulls first, p.nome;
end $$;

create or replace function registrar_chegada(p_ingresso uuid, p_chegou boolean) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_em timestamptz;
begin
  perform _exigir(pode_operar());
  update ingressos set chegada_em = case when p_chegou then coalesce(chegada_em, now()) end,
                       chegada_por = case when p_chegou then coalesce(chegada_por, auth.uid()) end
  where id = p_ingresso and setor = 'camarote'
    and status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente')
  returning chegada_em into v_em;
  perform _exigir(found, 'NAO_ENCONTRADO: convidado não está na lista do camarote');
  perform registrar_auditoria(case when p_chegou then 'chegada' else 'chegada_desfeita' end, 'ingresso', p_ingresso::text, null);
  return v_em;
end $$;

revoke execute on function pode_operar(), lista_camarote(uuid), registrar_chegada(uuid, boolean) from public, anon;
grant execute on function pode_operar(), lista_camarote(uuid), registrar_chegada(uuid, boolean) to authenticated, service_role;

-- a view precisa enxergar a nova coluna
drop view v_ingressos;
create view v_ingressos with (security_invoker = true) as
select i.*, p.nome, p.cpf, p.celular, p.email, a.nome as area_nome, a.ordem as area_ordem,
       pt.nome as convidado_de_nome, pe.indicacao_de, pe.origem, pe.prioridade, pe.catering, pe.centro_custo,
       pe.observacao as pedido_observacao
from ingressos i
join areas a on a.id = i.area_id
join pedidos pe on pe.id = i.pedido_id
left join pessoas p on p.id = i.pessoa_id
left join ingressos t on t.id = i.convidado_de
left join pessoas pt on pt.id = t.pessoa_id;
grant select on v_ingressos to authenticated, service_role;
