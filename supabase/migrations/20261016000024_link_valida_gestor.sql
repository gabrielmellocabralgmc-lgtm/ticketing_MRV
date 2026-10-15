-- Quem preenche pelo link (de qualquer convite: área, Marketing/Admin ou anfitrião do camarote)
-- fica como "Preenchido" e só segue depois da validação do gestor da área daquele convite.

create or replace function preencher_convite(p_token text, p_pessoas jsonb, p_aceite_privacidade boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_conv convites;
  v_n int := jsonb_array_length(coalesce(p_pessoas, '[]'::jsonb));
  v_vagas uuid[];
  v_titular uuid;
  v_pessoa uuid;
  v_tokens jsonb := '[]'::jsonb;
  v_ev eventos;
  i int;
begin
  select * into v_conv from convites where token = p_token for update;
  perform _exigir(found, 'NAO_ENCONTRADO: link inválido');
  perform _exigir(v_conv.status = 'aguardando', 'CONVITE_INDISPONIVEL: este convite já foi preenchido ou cancelado');
  perform _exigir(v_conv.expira_em > now(), 'CONVITE_EXPIRADO: o prazo deste convite terminou');
  perform _exigir(coalesce(p_aceite_privacidade, false), 'ACEITE_OBRIGATORIO: é preciso aceitar o aviso de privacidade');
  perform _exigir(v_n between 1 and v_conv.qtd_lugares, format('VALOR_INVALIDO: este convite vale para até %s pessoa(s)', v_conv.qtd_lugares));
  select * into v_ev from eventos where id = v_conv.evento_id;
  perform _exigir(v_ev.status in ('aberto', 'fechado'), 'EVENTO_FECHADO: o evento não está recebendo solicitações');

  select array_agg(id order by criado_em, id) into v_vagas
  from ingressos where convite_id = v_conv.id and status in ('convite_enviado', 'aguardando_preenchimento');

  perform _ctx('torcedor', 'preenchido pelo convidado');
  for i in 1..v_n loop
    v_pessoa := _upsert_pessoa(p_pessoas -> (i - 1), true);
    perform _checar_duplicado(v_conv.evento_id, v_pessoa);
    perform _mudar_status(v_vagas[i], 'solicitado', 'torcedor', 'preenchido pelo convidado: aguarda a validação do gestor da área');
    update ingressos set pessoa_id = v_pessoa, preenchido_por = 'convidado',
                         convidado_de = coalesce(v_conv.convidado_de, case when i > 1 then v_titular end)
    where id = v_vagas[i];
    if i = 1 then v_titular := v_vagas[i]; end if;
    v_tokens := v_tokens || jsonb_build_object('token', (select token from ingressos where id = v_vagas[i]),
                                               'nome', (select nome from pessoas where id = v_pessoa));
  end loop;
  -- lugares não usados voltam para o saldo da área
  for i in v_n + 1 .. coalesce(array_length(v_vagas, 1), 0) loop
    perform _mudar_status(v_vagas[i], 'cancelado', 'torcedor', 'lugar não utilizado pelo convidado');
  end loop;

  if v_conv.convidado_de is null then
    update pedidos set titular_ingresso_id = v_titular where id = v_conv.pedido_id;
  end if;
  update convites set status = 'preenchido', preenchido_em = now() where id = v_conv.id;
  if v_n < coalesce(array_length(v_vagas, 1), 0) then
    perform _promover_lista_espera(v_conv.evento_id, v_conv.setor, v_conv.area_id);
  end if;
  return jsonb_build_object('ingressos', v_tokens);
end $$;
