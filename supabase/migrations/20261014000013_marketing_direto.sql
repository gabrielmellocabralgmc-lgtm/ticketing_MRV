-- Ajustes: o Marketing não precisa de responsável nem de aprovação.
-- Convites gerados por Admin/Marketing entram aprovados quando o convidado preenche;
-- a área Marketing não aparece como pendência "sem pedido" no dashboard.

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
  v_aprovado boolean;
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

  -- convite gerado pelo Marketing/Admin (ou pelo anfitrião do camarote): entra aprovado
  v_aprovado := v_conv.convidado_de is not null
    or exists (select 1 from perfis where user_id = v_conv.criado_por and papel in ('admin', 'marketing'));
  perform _ctx('torcedor', 'preenchido pelo convidado');
  for i in 1..v_n loop
    v_pessoa := _upsert_pessoa(p_pessoas -> (i - 1), true);
    perform _checar_duplicado(v_conv.evento_id, v_pessoa);
    if v_aprovado then
      perform _mudar_status(v_vagas[i], 'aprovado', 'sistema', 'convidado preencheu os dados (convite do Marketing)');
    else
      perform _mudar_status(v_vagas[i], 'solicitado', 'torcedor', 'preenchido pelo convidado');
    end if;
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

create or replace function dashboard_eventos()
returns table (evento jsonb)
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'titulo', e.titulo, 'inicio', e.inicio, 'status', e.status, 'concorrido', e.concorrido,
    'prazo_solicitacao', e.prazo_solicitacao, 'adversario', e.adversario,
    'setores', (
      select coalesce(jsonb_agg(s.x order by s.ordem), '[]'::jsonb) from (
        select es.setor::text as ordem, jsonb_build_object(
          'setor', es.setor, 'capacidade', es.capacidade,
          'solicitados', count(i.id) filter (where status_consome(i.status) and i.status not in ('convite_enviado', 'aguardando_preenchimento')),
          'aprovados', count(i.id) filter (where i.status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente', 'no_show')),
          'enviados', count(i.id) filter (where i.status in ('enviado', 'confirmado', 'presente', 'no_show')),
          'confirmados', count(i.id) filter (where i.status in ('confirmado', 'presente')),
          'presentes', count(i.id) filter (where i.status = 'presente' or (i.setor = 'camarote' and i.chegada_em is not null)),
          'espera', count(i.id) filter (where i.status = 'lista_espera')
        ) as x
        from evento_setores es left join ingressos i on i.evento_id = es.evento_id and i.setor = es.setor
        where es.evento_id = e.id
        group by es.setor, es.capacidade
      ) s
    ),
    'pendencias', jsonb_build_object(
      'areas_sem_pedido', (
        select coalesce(jsonb_agg(a.nome order by a.ordem), '[]'::jsonb) from cotas c join areas a on a.id = c.area_id
        where c.evento_id = e.id and c.setor <> 'camarote' and c.quantidade > 0 and not c.sob_demanda and a.slug <> 'marketing'
          and not exists (select 1 from ingressos i where i.evento_id = e.id and i.area_id = c.area_id and i.setor = c.setor)),
      'listas_sem_validar', (
        select coalesce(jsonb_agg(distinct a.nome), '[]'::jsonb) from ingressos i join areas a on a.id = i.area_id
        where i.evento_id = e.id and i.status = 'solicitado' and i.setor <> 'camarote'),
      'convites_aguardando', (select count(*) from convites c where c.evento_id = e.id and c.status = 'aguardando' and c.expira_em > now()),
      'convites_expiram_24h', (select count(*) from convites c where c.evento_id = e.id and c.status = 'aguardando' and c.expira_em between now() and now() + interval '24 hours'),
      'a_aprovar', (select count(*) from ingressos i where i.evento_id = e.id and i.status = 'validado_area'),
      'facial_pendente', (select count(*) from ingressos i where i.evento_id = e.id and i.status in ('aprovado', 'facial_pendente')),
      'a_enviar', (select count(*) from ingressos i where i.evento_id = e.id and i.status = 'facial_ok'),
      'fila_camarote', (select count(*) from ingressos i where i.evento_id = e.id and i.setor = 'camarote' and i.status = 'lista_espera'),
      'na_porta', (select count(*) from walkins w where w.evento_id = e.id and w.status = 'pendente')
    )
  )
  from eventos e
  where eh_staff() and e.status in ('rascunho', 'aberto', 'fechado') and e.inicio > now() - interval '12 hours'
  order by e.inicio
$$;
