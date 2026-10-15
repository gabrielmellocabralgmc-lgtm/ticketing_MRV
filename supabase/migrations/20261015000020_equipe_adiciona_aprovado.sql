-- O que o Admin ou a gestora de Marketing adicionam ("+ Adicionar convidado") entra sempre
-- aprovado — inclusive no camarote de jogo concorrido (não passa pela fila de prioridade).
-- O Marketing tem os mesmos poderes do Admin para adicionar e para informar o nome depois.
-- (A fila de prioridade continua valendo para os pedidos registrados na central do camarote.)

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
  v_avulsos boolean := v_staff and coalesce((p_opcoes ->> 'avulsos')::boolean, false);
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
  if p_setor = 'camarote' and v_ev.concorrido and not v_avulsos and not coalesce((p_opcoes ->> 'ignorar_cota')::boolean, false) then
    v_status := 'lista_espera';
  end if;
  -- O Marketing é quem aprova: o que ele mesmo lança já entra aprovado
  if v_origem = 'marketing' and v_status = 'solicitado' then v_status := 'aprovado'; end if;

  insert into pedidos (evento_id, setor, area_id, origem, solicitante, prioridade, catering, centro_custo, indicacao_de, observacao, manual_admin)
  values (p_evento, p_setor, p_area, v_origem, auth.uid(),
          (p_opcoes ->> 'prioridade')::prioridade_camarote, (p_opcoes ->> 'catering')::tipo_catering,
          p_opcoes ->> 'centro_custo', limpar_nome(p_opcoes ->> 'indicacao_de'), p_opcoes ->> 'observacao', v_avulsos)
  returning id into v_pedido;

  perform _ctx('usuario', coalesce(p_opcoes ->> 'motivo', case
    when v_status = 'lista_espera' and p_setor = 'camarote' and v_ev.concorrido then 'jogo concorrido: na fila por prioridade'
    when v_status = 'lista_espera' then 'cota esgotada: entrou na lista de espera' end));
  for p in select * from jsonb_array_elements(p_pessoas) loop
    i := i + 1;
    -- Marketing cola só nome + CPF; áreas e convidados informam também o celular
    if v_origem = 'marketing' then
      -- adicionados pelo Admin (avulsos) podem vir só com o CPF; o nome é informado depois
      perform _exigir(v_avulsos or limpar_nome(p ->> 'nome') is not null, 'DADOS_INCOMPLETOS: informe o nome');
      perform _exigir(normalizar_cpf(p ->> 'cpf') is not null, format('DADOS_INCOMPLETOS: informe o CPF de %s', coalesce(p ->> 'nome', 'todas as pessoas')));
    end if;
    v_pessoa := _upsert_pessoa(p || jsonb_build_object('colaborador', coalesce((p ->> 'colaborador')::boolean, i = 1 and not v_importacao and not v_avulsos)),
                               not v_importacao and v_origem <> 'marketing');
    if not v_liberar then perform _checar_duplicado(p_evento, v_pessoa); end if;
    insert into ingressos (evento_id, setor, area_id, pedido_id, pessoa_id, convidado_de, status, preenchido_por,
                           cpf_duplicado_liberado, observacao)
    values (p_evento, p_setor, p_area, v_pedido, v_pessoa, case when i > 1 and not v_avulsos then v_titular end,
            case when v_importacao and v_staff and p ? 'status' then (p ->> 'status')::status_ingresso else v_status end,
            case v_origem when 'importacao' then 'importacao'::preenchido_por when 'forms' then 'importacao'::preenchido_por
                          when 'marketing' then 'marketing'::preenchido_por else 'responsavel'::preenchido_por end,
            v_liberar, p ->> 'observacao')
    returning id into v_ing;
    if i = 1 then v_titular := v_ing; end if;
    v_ids := v_ids || v_ing;
  end loop;
  update pedidos set titular_ingresso_id = v_titular where id = v_pedido;
  -- preenchido pelo gestor da área: já entra validado (segue direto para pronto para envio)
  if v_status = 'solicitado' and v_origem = 'responsavel' then
    perform _auto_validar(v_pedido);
    v_status := 'facial_ok';
  end if;

  return jsonb_build_object('pedido_id', v_pedido, 'status', v_status, 'ingressos', to_jsonb(v_ids));
end $$;

create or replace function atualizar_dados_admin(p_ingresso uuid, p_nome text, p_celular text default null, p_email text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pessoa uuid;
  v_nome text := limpar_nome(p_nome);
  v_cel text := nullif(regexp_replace(coalesce(p_celular, ''), '\D', '', 'g'), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  perform _exigir(eh_staff());
  select i.pessoa_id into v_pessoa from ingressos i join pedidos pe on pe.id = i.pedido_id
  where i.id = p_ingresso and pe.manual_admin;
  perform _exigir(found, 'SEM_PERMISSAO: só dá para alterar aqui os convidados adicionados pelo Admin ou pelo Marketing');
  perform _exigir(v_nome is not null and v_nome <> '(sem nome)', 'DADOS_INCOMPLETOS: informe o nome');
  perform _exigir(v_cel is null or length(v_cel) between 10 and 11, 'DADOS_INCOMPLETOS: celular inválido (DDD + número)');
  perform _exigir(v_email is null or v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'EMAIL_INVALIDO: e-mail inválido');
  update pessoas set nome = v_nome, celular = coalesce(v_cel, celular), email = coalesce(v_email, email), atualizado_em = now()
  where id = v_pessoa;
  perform registrar_auditoria('alterar', 'ingresso', p_ingresso::text, jsonb_build_object('campos', 'nome/contato (adicionado pelo Admin)'));
end $$;
