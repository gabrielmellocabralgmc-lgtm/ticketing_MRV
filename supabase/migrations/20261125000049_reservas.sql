-- Reservas de ingressos: lugares bloqueados "para a pessoa X da área Y" antes de ter nome e CPF.
--   · Camarote: sai do pote geral da MRV (capacidade do setor), sem cota de área.
--   · Demais setores: sai da cota da área.
--   · A reserva ocupa lugar desde já (status_consome não exclui 'reservado'), aparece nas listas
--     como "Reservado para X" e não entra na fila de envio.
--   · Preencher a reserva (nome + CPF) leva o ingresso para aprovado (ou direto a "pronto para
--     envio", se a facial já é conhecida). Cancelar devolve o lugar ao saldo.

-- ---------------------------------------------------------------- dado novo
alter table ingressos add column reservado_para text check (length(reservado_para) <= 200);

-- v_ingressos usa i.*: recriada para incluir a coluna nova (definição igual à da migração 022)
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

-- ---------------------------------------------------------------- transições
insert into transicoes (de, para, papeis, torcedor, sistema) values
  ('reservado', 'aprovado', '{admin,marketing}', false, true),
  ('reservado', 'cancelado', '{admin,marketing}', false, true)
on conflict (de, para) do nothing;

-- ---------------------------------------------------------------- reservar
-- Versões antigas (5 e 6 argumentos, criadas em 15–24/11) saem: a de produção abatia a cota da
-- área diretamente (o lugar ficava descontado duas vezes) e não aceitava camarote.
drop function if exists reservar_ingressos(uuid, setor, uuid, int, text);
drop function if exists reservar_ingressos(uuid, setor, uuid, int, text, boolean);

create or replace function reservar_ingressos(p_evento uuid, p_setor setor, p_area uuid, p_qtd int,
                                              p_para text, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_para text := limpar_nome(p_para);
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_livre int;
  v_pedido uuid;
  v_ids uuid[];
begin
  perform _exigir(eh_staff(), 'SEM_PERMISSAO: apenas Admin ou Marketing podem reservar ingressos');
  perform _exigir(p_qtd between 1 and 60, 'VALOR_INVALIDO: reserve de 1 a 60 ingressos por vez');
  perform _exigir(v_para is not null, 'DADOS_INCOMPLETOS: informe para quem é a reserva');
  perform _exigir(exists (select 1 from areas where id = p_area), 'NAO_ENCONTRADO: área não encontrada');
  perform _travar_setor(p_evento, p_setor);

  if p_setor = 'camarote' then
    -- camarote: pote geral da MRV, sem cota por área
    select es.capacidade - ocupados(p_evento, p_setor) into v_livre
    from evento_setores es where es.evento_id = p_evento and es.setor = p_setor;
    if v_livre < p_qtd then
      raise exception 'COTA_EXCEDIDA: o camarote tem só % lugar(es) livre(s)', greatest(v_livre, 0);
    end if;
  elsif not _cabe(p_evento, p_setor, p_area, p_qtd) then
    raise exception 'COTA_EXCEDIDA: a área tem só % lugar(es) livre(s) em %',
      coalesce((select s.saldo from saldo(p_evento, p_setor, p_area) s), 0), p_setor;
  end if;

  insert into pedidos (evento_id, setor, area_id, origem, solicitante, observacao)
  values (p_evento, p_setor, p_area, 'marketing', auth.uid(), v_obs)
  returning id into v_pedido;

  perform _ctx('usuario', 'reserva para ' || v_para);
  with novos as (
    insert into ingressos (evento_id, setor, area_id, pedido_id, status, preenchido_por, reservado_para, observacao)
    select p_evento, p_setor, p_area, v_pedido, 'reservado', 'marketing', v_para, v_obs from generate_series(1, p_qtd)
    returning id
  ) select array_agg(id) into v_ids from novos;

  perform registrar_auditoria('reservar', 'pedido', v_pedido::text,
    jsonb_build_object('setor', p_setor, 'area', p_area, 'qtd', p_qtd, 'para', v_para));
  return jsonb_build_object('pedido_id', v_pedido, 'ingressos', to_jsonb(v_ids));
end $$;
revoke execute on function reservar_ingressos(uuid, setor, uuid, int, text, text) from public, anon;
grant execute on function reservar_ingressos(uuid, setor, uuid, int, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------- preencher a reserva
-- p_pessoa: {nome, cpf, celular, email}. Nome e CPF obrigatórios; celular e e-mail opcionais.
create or replace function preencher_reserva(p_ingresso uuid, p_pessoa jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
  v_pessoa uuid;
  v_status status_ingresso;
begin
  perform _exigir(eh_staff(), 'SEM_PERMISSAO: apenas Admin ou Marketing podem preencher reservas');
  select * into v_ing from ingressos where id = p_ingresso for update;
  perform _exigir(found, 'NAO_ENCONTRADO: reserva não encontrada');
  perform _exigir(v_ing.status = 'reservado', 'TRANSICAO_INVALIDA: este ingresso não é uma reserva em aberto');
  perform _exigir(limpar_nome(p_pessoa ->> 'nome') is not null, 'DADOS_INCOMPLETOS: informe o nome');
  perform _exigir(nullif(btrim(coalesce(p_pessoa ->> 'cpf', '')), '') is not null, 'DADOS_INCOMPLETOS: informe o CPF');

  v_pessoa := _upsert_pessoa(p_pessoa, false);
  perform _checar_duplicado(v_ing.evento_id, v_pessoa, v_ing.id);
  update ingressos set pessoa_id = v_pessoa where id = p_ingresso;
  perform _mudar_status(p_ingresso, 'aprovado', 'usuario', 'reserva preenchida (era para ' || coalesce(v_ing.reservado_para, '?') || ')');

  select status into v_status from ingressos where id = p_ingresso;
  return v_status::text;
end $$;
revoke execute on function preencher_reserva(uuid, jsonb) from public, anon;
grant execute on function preencher_reserva(uuid, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------- cancelar
-- Correção: a versão anterior somava +1 na cota da área ao cancelar. O saldo já é calculado pelos
-- status (cancelado não ocupa lugar), então o lugar volta sozinho; o +1 dava uma vaga a mais.
create or replace function cancelar_ingresso(p_ingresso uuid, p_motivo text default '') returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
begin
  perform _exigir(eh_staff(), 'SEM_PERMISSAO: apenas Admin ou Marketing podem cancelar ingressos');
  select * into v_ing from ingressos where id = p_ingresso for update;
  perform _exigir(found, 'INGRESSO_NAO_EXISTE: ingresso não encontrado');
  perform _exigir(v_ing.status not in ('cancelado', 'no_show', 'presente'), 'JA_PROCESSADO: não pode cancelar este ingresso');

  perform _ctx('usuario', nullif(btrim(coalesce(p_motivo, '')), ''));
  update ingressos set status = 'cancelado' where id = p_ingresso;
  perform registrar_auditoria('cancelar', 'ingresso', p_ingresso::text, jsonb_build_object('de', v_ing.status, 'motivo', p_motivo));
  return 'cancelado';
end $$;
