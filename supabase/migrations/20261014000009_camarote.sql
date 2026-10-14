-- Fase 2: central de pedidos do camarote, fila por prioridade, convites do anfitrião,
-- histórico do pedido, entrada não listada (walk-in) e encerramento com no-show.

-- ---------------------------------------------------------------- prioridade
create or replace function rank_prioridade(p prioridade_camarote) returns int
language sql immutable as $$
  select case p when 'exec_presidencia' then 1 when 'diretor' then 2 when 'gestor' then 3 else 4 end
$$;

-- transições novas: sair da fila já aprovado; encerramento automático (presente / no-show);
-- convidado do anfitrião entra aprovado
insert into transicoes (de, para, papeis, torcedor, sistema) values
  ('lista_espera', 'aprovado', '{admin,marketing}', false, true),
  ('convite_enviado', 'aprovado', '{}', false, true),
  ('aguardando_preenchimento', 'aprovado', '{}', false, true),
  ('aprovado', 'presente', '{}', false, true),
  ('facial_pendente', 'presente', '{}', false, true),
  ('facial_ok', 'presente', '{}', false, true),
  ('aprovado', 'no_show', '{}', false, true),
  ('facial_pendente', 'no_show', '{}', false, true),
  ('facial_ok', 'no_show', '{}', false, true)
on conflict (de, para) do nothing;
update transicoes set sistema = true where (de, para) in (('enviado', 'presente'), ('confirmado', 'presente'));

-- ---------------------------------------------------------------- pedidos (camarote concorrido entra na fila)
create or replace function criar_pedido(p_evento uuid, p_setor setor, p_area uuid, p_pessoas jsonb, p_opcoes jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ev eventos;
  v_staff boolean := eh_staff();
  v_origem origem_pedido := coalesce((p_opcoes ->> 'origem')::origem_pedido, case when eh_staff() then 'marketing'::origem_pedido else 'responsavel'::origem_pedido end);
  v_importacao boolean := v_origem in ('importacao', 'forms');
  v_n int := jsonb_array_length(coalesce(p_pessoas, '[]'::jsonb));
  v_status status_ingresso;
  v_pedido uuid;
  v_titular uuid;
  v_pessoa uuid;
  v_ing uuid;
  v_ids uuid[] := '{}';
  v_liberar boolean := v_staff and coalesce((p_opcoes ->> 'liberar_duplicado')::boolean, false);
  p jsonb;
  i int := 0;
begin
  perform _exigir(responde_area(p_area));
  perform _exigir(v_staff or v_origem in ('responsavel', 'forms'), 'SEM_PERMISSAO: origem de pedido não permitida');
  perform _exigir(v_staff or p_setor <> 'camarote', 'CAMAROTE_MARKETING: pedidos de camarote são lançados pelo Marketing MRV');
  perform _exigir(v_n between 1 and 20, 'VALOR_INVALIDO: informe de 1 a 20 pessoas');

  select * into v_ev from eventos where id = p_evento;
  perform _exigir(found, 'NAO_ENCONTRADO: evento não encontrado');
  if not v_staff then
    perform _exigir(v_ev.status = 'aberto', 'EVENTO_FECHADO: o evento não está aberto para solicitações');
    perform _exigir(v_ev.prazo_solicitacao is null or now() <= v_ev.prazo_solicitacao, 'PRAZO_ENCERRADO: o prazo de solicitação terminou');
  end if;

  perform _travar_setor(p_evento, p_setor);
  if v_staff and coalesce((p_opcoes ->> 'ignorar_cota')::boolean, false) then
    v_status := 'solicitado';
  elsif _cabe(p_evento, p_setor, p_area, v_n) then
    v_status := 'solicitado';
  elsif coalesce((p_opcoes ->> 'lista_espera')::boolean, true) then
    v_status := 'lista_espera';
  else
    raise exception 'COTA_EXCEDIDA: a área não tem saldo para % ingresso(s) (saldo: %)',
      v_n, (select s.saldo from saldo(p_evento, p_setor, p_area) s);
  end if;
  -- Camarote em jogo concorrido: todo pedido entra na fila e o Marketing distribui pela prioridade
  if p_setor = 'camarote' and v_ev.concorrido and not coalesce((p_opcoes ->> 'ignorar_cota')::boolean, false) then
    v_status := 'lista_espera';
  end if;
  -- O Marketing é quem aprova: o que ele mesmo lança já entra aprovado
  if v_origem = 'marketing' and v_status = 'solicitado' then v_status := 'aprovado'; end if;

  insert into pedidos (evento_id, setor, area_id, origem, solicitante, prioridade, catering, centro_custo, indicacao_de, observacao)
  values (p_evento, p_setor, p_area, v_origem, auth.uid(),
          (p_opcoes ->> 'prioridade')::prioridade_camarote, (p_opcoes ->> 'catering')::tipo_catering,
          p_opcoes ->> 'centro_custo', limpar_nome(p_opcoes ->> 'indicacao_de'), p_opcoes ->> 'observacao')
  returning id into v_pedido;

  perform _ctx('usuario', coalesce(p_opcoes ->> 'motivo', case
    when v_status = 'lista_espera' and p_setor = 'camarote' and v_ev.concorrido then 'jogo concorrido: na fila por prioridade'
    when v_status = 'lista_espera' then 'cota esgotada: entrou na lista de espera' end));
  for p in select * from jsonb_array_elements(p_pessoas) loop
    i := i + 1;
    -- Marketing cola só nome + CPF; áreas e convidados informam também o celular
    if v_origem = 'marketing' then
      perform _exigir(limpar_nome(p ->> 'nome') is not null, 'DADOS_INCOMPLETOS: informe o nome');
      perform _exigir(normalizar_cpf(p ->> 'cpf') is not null, format('DADOS_INCOMPLETOS: informe o CPF de %s', p ->> 'nome'));
    end if;
    v_pessoa := _upsert_pessoa(p || jsonb_build_object('colaborador', coalesce((p ->> 'colaborador')::boolean, i = 1 and not v_importacao)),
                               not v_importacao and v_origem <> 'marketing');
    if not v_liberar then perform _checar_duplicado(p_evento, v_pessoa); end if;
    insert into ingressos (evento_id, setor, area_id, pedido_id, pessoa_id, convidado_de, status, preenchido_por,
                           cpf_duplicado_liberado, observacao)
    values (p_evento, p_setor, p_area, v_pedido, v_pessoa, case when i > 1 then v_titular end,
            case when v_importacao and v_staff and p ? 'status' then (p ->> 'status')::status_ingresso else v_status end,
            case v_origem when 'importacao' then 'importacao'::preenchido_por when 'forms' then 'importacao'::preenchido_por
                          when 'marketing' then 'marketing'::preenchido_por else 'responsavel'::preenchido_por end,
            v_liberar, p ->> 'observacao')
    returning id into v_ing;
    if i = 1 then v_titular := v_ing; end if;
    v_ids := v_ids || v_ing;
  end loop;
  update pedidos set titular_ingresso_id = v_titular where id = v_pedido;

  return jsonb_build_object('pedido_id', v_pedido, 'status', v_status, 'ingressos', to_jsonb(v_ids));
end $$;


-- Lista de espera: no camarote a ordem é prioridade e depois a hora do pedido; em jogo
-- concorrido o camarote não sobe sozinho (o Marketing distribui pela prioridade).
create or replace function _promover_lista_espera(p_evento uuid, p_setor setor, p_area uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_pedido uuid;
  v_n int;
  v_total int := 0;
  v_id uuid;
begin
  if p_setor = 'camarote' and (select concorrido from eventos where id = p_evento) then return 0; end if;
  perform _travar_setor(p_evento, p_setor);
  loop
    select i.pedido_id, count(*)::int into v_pedido, v_n
    from ingressos i join pedidos pe on pe.id = i.pedido_id
    where i.evento_id = p_evento and i.setor = p_setor and i.area_id = p_area and i.status = 'lista_espera'
    group by i.pedido_id, pe.prioridade
    order by case when p_setor = 'camarote' then rank_prioridade(pe.prioridade) else 0 end, min(i.lista_espera_desde), i.pedido_id
    limit 1;
    exit when v_pedido is null or not _cabe(p_evento, p_setor, p_area, v_n);
    for v_id in select id from ingressos where pedido_id = v_pedido and status = 'lista_espera' loop
      perform _mudar_status(v_id, 'solicitado', 'sistema', 'promovido da lista de espera');
    end loop;
    v_total := v_total + v_n;
    v_pedido := null;
  end loop;
  return v_total;
end $$;

-- Aprova um pedido da fila do camarote (se couber nas vagas)
create or replace function aprovar_pedido_fila(p_pedido uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_pe pedidos;
  v_n int;
  v_id uuid;
begin
  perform _exigir(eh_staff());
  select * into v_pe from pedidos where id = p_pedido;
  perform _exigir(found, 'NAO_ENCONTRADO: pedido não encontrado');
  perform _travar_setor(v_pe.evento_id, v_pe.setor);
  select count(*)::int into v_n from ingressos where pedido_id = p_pedido and status = 'lista_espera';
  perform _exigir(v_n > 0, 'TRANSICAO_INVALIDA: o pedido não está na fila');
  if not _cabe(v_pe.evento_id, v_pe.setor, v_pe.area_id, v_n) then
    raise exception 'COTA_EXCEDIDA: não há % vaga(s) livre(s) no %', v_n, v_pe.setor;
  end if;
  for v_id in select id from ingressos where pedido_id = p_pedido and status = 'lista_espera' order by convidado_de nulls first, criado_em loop
    perform _mudar_status(v_id, 'aprovado', 'usuario', 'aprovado da fila do camarote');
  end loop;
  return v_n;
end $$;

-- Preenche as vagas livres do camarote com a fila, pela prioridade e depois pela hora do pedido.
-- Um pedido que não cabe inteiro é pulado (um menor, logo atrás, pode caber).
create or replace function distribuir_camarote(p_evento uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_total int := 0;
begin
  perform _exigir(eh_staff());
  perform _travar_setor(p_evento, 'camarote');
  for r in
    select i.pedido_id, count(*)::int as n
    from ingressos i join pedidos pe on pe.id = i.pedido_id
    where i.evento_id = p_evento and i.setor = 'camarote' and i.status = 'lista_espera'
    group by i.pedido_id, pe.prioridade
    order by rank_prioridade(pe.prioridade), min(i.lista_espera_desde), i.pedido_id
  loop
    if _cabe(p_evento, 'camarote', (select area_id from pedidos where id = r.pedido_id), r.n) then
      v_total := v_total + aprovar_pedido_fila(r.pedido_id);
    end if;
  end loop;
  return v_total;
end $$;

-- Ajusta dados do pedido (prioridade, catering…) com registro na auditoria
create or replace function atualizar_pedido(p_pedido uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_antes pedidos;
begin
  perform _exigir(eh_staff());
  select * into v_antes from pedidos where id = p_pedido for update;
  perform _exigir(found, 'NAO_ENCONTRADO: pedido não encontrado');
  if p ->> 'catering' = 'corporativo' then
    perform _exigir(nullif(btrim(coalesce(p ->> 'centro_custo', '')), '') is not null,
                    'DADOS_INCOMPLETOS: informe o centro de custo para catering corporativo');
  end if;
  update pedidos set
    prioridade = coalesce((p ->> 'prioridade')::prioridade_camarote, prioridade),
    catering = case when p ? 'catering' then (p ->> 'catering')::tipo_catering else catering end,
    centro_custo = case when p ? 'centro_custo' then nullif(btrim(p ->> 'centro_custo'), '') else centro_custo end,
    indicacao_de = case when p ? 'indicacao_de' then limpar_nome(p ->> 'indicacao_de') else indicacao_de end,
    observacao = case when p ? 'observacao' then nullif(btrim(p ->> 'observacao'), '') else observacao end
  where id = p_pedido;
  perform registrar_auditoria('alterar', 'pedido', p_pedido::text,
    jsonb_build_object('antes', jsonb_build_object('prioridade', v_antes.prioridade, 'catering', v_antes.catering,
      'centro_custo', v_antes.centro_custo, 'indicacao_de', v_antes.indicacao_de, 'observacao', v_antes.observacao), 'depois', p));
end $$;

-- ---------------------------------------------------------------- convites do anfitrião (camarote)
alter table convites add column convidado_de uuid references ingressos (id) on delete cascade;

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
  perform _exigir(found and v_ing.convidado_de is null, 'NAO_ENCONTRADO: anfitrião não encontrado');
  perform _exigir(v_ing.status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado'),
                  'TRANSICAO_INVALIDA: aprove o pedido do anfitrião antes de gerar links para os convidados');
  select * into v_ev from eventos where id = v_ing.evento_id;
  v_expira := coalesce(p_expira_em, v_ev.inicio - interval '1 day');
  perform _exigir(v_expira > now(), 'VALOR_INVALIDO: a validade do convite precisa estar no futuro');
  perform _travar_setor(v_ing.evento_id, v_ing.setor);
  if not _cabe(v_ing.evento_id, v_ing.setor, v_ing.area_id, p_qtd) then
    raise exception 'COTA_EXCEDIDA: não há % vaga(s) livre(s) no camarote', p_qtd;
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
    if v_conv.convidado_de is not null then
      -- convite do anfitrião do camarote: o pedido dele já foi aprovado pelo Marketing
      perform _mudar_status(v_vagas[i], 'aprovado', 'sistema', 'convidado do anfitrião preencheu os dados');
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


-- ---------------------------------------------------------------- histórico do pedido
create or replace function historico_pedido(p_pedido uuid)
returns table (em timestamptz, quem text, oque text)
language sql stable security definer set search_path = public as $$
  select * from (
    select pe.criado_em, coalesce(pf.nome, 'sistema'),
           'Pedido lançado (' || pe.origem || coalesce(', prioridade ' || pe.prioridade, '') || ')'
    from pedidos pe left join perfis pf on pf.user_id = pe.solicitante
    where pe.id = p_pedido
    union all
    select h.em,
           case h.autor_tipo when 'torcedor' then 'convidado (link)' when 'sistema' then coalesce(pf.nome, 'sistema') else coalesce(pf.nome, 'usuário') end,
           coalesce(p.nome, 'vaga') || ': ' || coalesce(h.de::text || ' → ', '') || h.para || coalesce(' · ' || h.motivo, '')
    from status_historico h
    join ingressos i on i.id = h.ingresso_id
    left join pessoas p on p.id = i.pessoa_id
    left join perfis pf on pf.user_id = h.autor
    where i.pedido_id = p_pedido
    union all
    select a.em, coalesce(pf.nome, 'sistema'), 'Dados do pedido alterados: ' || coalesce((a.detalhes -> 'depois')::text, '')
    from auditoria a left join perfis pf on pf.user_id = a.autor
    where a.entidade = 'pedido' and a.entidade_id = p_pedido::text
  ) x
  where eh_staff()
  order by 1
$$;

-- ---------------------------------------------------------------- entrada não listada (walk-in)
create table walkins (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos (id) on delete cascade,
  nome text not null,
  cpf char(11),
  anfitriao_ingresso uuid references ingressos (id) on delete set null,
  anfitriao_texto text,
  observacao text,
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  ingresso_id uuid references ingressos (id) on delete set null,
  criado_por uuid references perfis (user_id),
  criado_em timestamptz not null default now(),
  decidido_por uuid references perfis (user_id),
  decidido_em timestamptz
);
alter table walkins enable row level security;
-- leitura e escrita só pelas funções abaixo

create or replace function registrar_walkin(p_evento uuid, p_nome text, p_cpf text, p_anfitriao uuid, p_anfitriao_texto text, p_observacao text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cpf text := normalizar_cpf(p_cpf);
  v_id uuid;
begin
  perform _exigir(pode_operar());
  perform _exigir(limpar_nome(p_nome) is not null, 'DADOS_INCOMPLETOS: informe o nome');
  perform _exigir(v_cpf is null or cpf_valido(v_cpf), 'CPF_INVALIDO: CPF inválido');
  perform _exigir(p_anfitriao is not null or limpar_nome(p_anfitriao_texto) is not null, 'DADOS_INCOMPLETOS: informe quem está recebendo esta pessoa');
  insert into walkins (evento_id, nome, cpf, anfitriao_ingresso, anfitriao_texto, observacao, criado_por)
  values (p_evento, limpar_nome(p_nome), v_cpf, p_anfitriao, limpar_nome(p_anfitriao_texto), nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid())
  returning id into v_id;
  perform registrar_auditoria('walkin', 'evento', p_evento::text, jsonb_build_object('walkin', v_id));
  return v_id;
end $$;

create or replace function lista_walkins(p_evento uuid)
returns table (id uuid, nome text, cpf_mascarado text, anfitriao text, observacao text, status text, criado_em timestamptz, registrado_por text)
language sql stable security definer set search_path = public as $$
  select w.id, w.nome, mascarar_cpf(w.cpf), coalesce(p.nome, w.anfitriao_texto), w.observacao, w.status, w.criado_em, pf.nome
  from walkins w
  left join ingressos i on i.id = w.anfitriao_ingresso
  left join pessoas p on p.id = i.pessoa_id
  left join perfis pf on pf.user_id = w.criado_por
  where w.evento_id = p_evento and pode_operar()
  order by w.status = 'pendente' desc, w.criado_em desc
$$;

-- Marketing aprova: vira um ingresso do camarote (convidado do anfitrião) já com a chegada marcada.
-- Entrada na porta: não bloqueia por vagas (fica registrado).
create or replace function decidir_walkin(p_walkin uuid, p_aprovar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  w walkins;
  v_anf ingressos;
  v_pedido uuid;
  v_area uuid;
  v_pessoa uuid;
  v_ing uuid;
begin
  perform _exigir(eh_staff());
  select * into w from walkins where id = p_walkin for update;
  perform _exigir(found and w.status = 'pendente', 'TRANSICAO_INVALIDA: esta entrada já foi decidida');
  if not p_aprovar then
    update walkins set status = 'recusado', decidido_por = auth.uid(), decidido_em = now() where id = p_walkin;
    return;
  end if;
  if w.anfitriao_ingresso is not null then
    select * into v_anf from ingressos where id = w.anfitriao_ingresso;
    v_pedido := v_anf.pedido_id;
    v_area := v_anf.area_id;
  else
    select id into v_area from areas where slug = 'marketing';
    insert into pedidos (evento_id, setor, area_id, origem, solicitante, indicacao_de, observacao)
    values (w.evento_id, 'camarote', v_area, 'marketing', auth.uid(), w.anfitriao_texto, 'Entrada não listada (walk-in)')
    returning id into v_pedido;
  end if;
  v_pessoa := _upsert_pessoa(jsonb_build_object('nome', w.nome, 'cpf', w.cpf), false);
  if w.cpf is not null then perform _checar_duplicado(w.evento_id, v_pessoa); end if;
  perform _ctx('usuario', 'entrada não listada aprovada pelo Marketing');
  insert into ingressos (evento_id, setor, area_id, pedido_id, pessoa_id, convidado_de, status, preenchido_por, chegada_em, chegada_por, observacao)
  values (w.evento_id, 'camarote', v_area, v_pedido, v_pessoa, w.anfitriao_ingresso, 'aprovado', 'marketing', now(), w.criado_por,
          coalesce('Walk-in: ' || w.observacao, 'Walk-in'))
  returning id into v_ing;
  if w.anfitriao_ingresso is null then update pedidos set titular_ingresso_id = v_ing where id = v_pedido; end if;
  update walkins set status = 'aprovado', ingresso_id = v_ing, decidido_por = auth.uid(), decidido_em = now() where id = p_walkin;
end $$;

-- ---------------------------------------------------------------- encerramento do evento
-- Camarote: quem confirmou chegada vira "presente"; quem não confirmou, "no-show".
create or replace function encerrar_evento(p_evento uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_chegou boolean;
  v_pres int := 0;
  v_no int := 0;
begin
  if auth.uid() is not null then perform _exigir(eh_staff()); end if;
  for v_id, v_chegou in
    select id, chegada_em is not null from ingressos
    where evento_id = p_evento and setor = 'camarote'
      and status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado')
  loop
    if v_chegou then
      perform _mudar_status(v_id, 'presente', 'sistema', 'chegada confirmada pela operação');
      v_pres := v_pres + 1;
    else
      perform _mudar_status(v_id, 'no_show', 'sistema', 'não compareceu (evento encerrado)');
      v_no := v_no + 1;
    end if;
  end loop;
  update walkins set status = 'recusado', decidido_em = now() where evento_id = p_evento and status = 'pendente';
  update eventos set status = 'realizado' where id = p_evento and status in ('aberto', 'fechado');
  perform registrar_auditoria('encerrar', 'evento', p_evento::text, jsonb_build_object('presentes', v_pres, 'no_show', v_no));
  return jsonb_build_object('presentes', v_pres, 'no_show', v_no);
end $$;

-- lista_camarote passa a mostrar também o status (para destacar quem entrou pela porta)
revoke execute on function rank_prioridade(prioridade_camarote), aprovar_pedido_fila(uuid), distribuir_camarote(uuid),
  atualizar_pedido(uuid, jsonb), criar_convite_anfitriao(uuid, int, text, timestamptz), historico_pedido(uuid),
  registrar_walkin(uuid, text, text, uuid, text, text), lista_walkins(uuid), decidir_walkin(uuid, boolean), encerrar_evento(uuid)
  from public, anon;
grant execute on function rank_prioridade(prioridade_camarote), aprovar_pedido_fila(uuid), distribuir_camarote(uuid),
  atualizar_pedido(uuid, jsonb), criar_convite_anfitriao(uuid, int, text, timestamptz), historico_pedido(uuid),
  registrar_walkin(uuid, text, text, uuid, text, text), lista_walkins(uuid), decidir_walkin(uuid, boolean), encerrar_evento(uuid)
  to authenticated, service_role;

-- Chegada com o horário real do celular (para confirmações feitas sem internet e enviadas depois)
drop function registrar_chegada(uuid, boolean);
create or replace function registrar_chegada(p_ingresso uuid, p_chegou boolean, p_em timestamptz default null) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_em timestamptz := case when p_em is null or p_em > now() + interval '5 minutes' or p_em < now() - interval '12 hours' then now() else p_em end;
  v_res timestamptz;
begin
  perform _exigir(pode_operar());
  update ingressos set chegada_em = case when p_chegou then coalesce(chegada_em, v_em) end,
                       chegada_por = case when p_chegou then coalesce(chegada_por, auth.uid()) end
  where id = p_ingresso and setor = 'camarote'
    and status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente')
  returning chegada_em into v_res;
  perform _exigir(found, 'NAO_ENCONTRADO: convidado não está na lista do camarote');
  perform registrar_auditoria(case when p_chegou then 'chegada' else 'chegada_desfeita' end, 'ingresso', p_ingresso::text, null);
  return v_res;
end $$;
revoke execute on function registrar_chegada(uuid, boolean, timestamptz) from public, anon;
grant execute on function registrar_chegada(uuid, boolean, timestamptz) to authenticated, service_role;
