-- Regras de negócio no banco: cota, CPF duplicado, status, lista de espera, convites.
-- Todas as escritas em pedidos/ingressos/convites passam por estas funções (não há
-- policy de INSERT/UPDATE nessas tabelas), então a regra vale para UI, importador e cron.
-- Erros de negócio usam o prefixo "CODIGO: mensagem" para a UI traduzir.

-- ---------------------------------------------------------------- utilidades
create or replace function gerar_token() returns text
language sql volatile as $$
  select translate(rtrim(encode(uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()), 'base64'), '='), '+/', '-_')
$$;

alter table ingressos alter column token set default gerar_token();
alter table convites alter column token set default gerar_token();

create or replace function cpf_valido(c text) returns boolean
language plpgsql immutable as $$
declare
  bruto text := regexp_replace(coalesce(c, ''), '\D', '', 'g');
  d text;
  s int;
  dv int;
begin
  if length(bruto) = 0 or length(bruto) > 11 then return false; end if;
  d := lpad(bruto, 11, '0');
  if d ~ '^(\d)\1{10}$' then return false; end if;
  for n in 9..10 loop
    s := 0;
    for i in 1..n loop
      s := s + substr(d, i, 1)::int * (n + 2 - i);
    end loop;
    dv := (s * 10) % 11 % 10;
    if dv <> substr(d, n + 1, 1)::int then return false; end if;
  end loop;
  return true;
end $$;

create or replace function normalizar_cpf(c text) returns text
language sql immutable as $$
  select case when length(regexp_replace(coalesce(c, ''), '\D', '', 'g')) between 1 and 11
              then lpad(regexp_replace(c, '\D', '', 'g'), 11, '0') end
$$;

create or replace function limpar_nome(n text) returns text
language sql immutable as $$
  select nullif(btrim(regexp_replace(replace(coalesce(n, ''), chr(160), ' '), '\s+', ' ', 'g')), '')
$$;

create or replace function mascarar_cpf(c text) returns text
language sql immutable as $$
  select case when c is null then null else '***.' || substr(c, 4, 3) || '.' || substr(c, 7, 3) || '-**' end
$$;

-- Status que ocupam lugar na cota
create or replace function status_consome(s status_ingresso) returns boolean
language sql immutable as $$
  select s not in ('convite_expirado', 'lista_espera', 'recusado', 'cancelado')
$$;

create or replace function _ctx(p_autor_tipo text, p_motivo text) returns void
language sql as $$
  select set_config('app.autor_tipo', coalesce(p_autor_tipo, 'usuario'), true),
         set_config('app.motivo', coalesce(p_motivo, ''), true);
$$;

-- ---------------------------------------------------------------- perfis e permissões
create or replace function meu_papel() returns papel_usuario
language sql stable security definer set search_path = public as $$
  select papel from perfis where user_id = auth.uid() and ativo
$$;

create or replace function eh_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() in ('admin', 'marketing'), false)
$$;

create or replace function eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() = 'admin', false)
$$;

create or replace function responde_area(p_area uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select eh_staff() or exists (
    select 1 from area_responsaveis ar join perfis p on p.user_id = ar.user_id
    where ar.area_id = p_area and ar.user_id = auth.uid() and p.ativo and p.papel = 'responsavel'
  )
$$;

create or replace function _exigir(p_ok boolean, p_msg text default 'SEM_PERMISSAO: você não tem permissão para esta ação') returns void
language plpgsql as $$
begin
  if not coalesce(p_ok, false) then raise exception '%', p_msg; end if;
end $$;

create or replace function registrar_auditoria(p_acao text, p_entidade text, p_entidade_id text, p_detalhes jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into auditoria (autor, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), p_acao, p_entidade, p_entidade_id, p_detalhes);
$$;

-- ---------------------------------------------------------------- triggers de histórico
create or replace function _trg_ingresso_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.atualizado_em := now();
    if new.status is not distinct from old.status then return new; end if;
  end if;
  if new.status = 'lista_espera' and new.lista_espera_desde is null then
    new.lista_espera_desde := now();
  end if;
  return new;
end $$;

create or replace function _trg_ingresso_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into status_historico (ingresso_id, de, para, autor, autor_tipo, motivo)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      auth.uid(),
      coalesce(nullif(current_setting('app.autor_tipo', true), ''), 'usuario'),
      nullif(current_setting('app.motivo', true), '')
    );
  end if;
  return null;
end $$;

create trigger ingressos_status_before before insert or update on ingressos
  for each row execute function _trg_ingresso_status();
create trigger ingressos_status_after after insert or update of status on ingressos
  for each row execute function _trg_ingresso_historico();

create or replace function _trg_hist_cotas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.quantidade = old.quantidade then return null; end if;
  insert into cotas_historico (evento_id, setor, area_id, de, para, autor, motivo)
  values (new.evento_id, new.setor, new.area_id,
          case when tg_op = 'UPDATE' then old.quantidade end, new.quantidade,
          auth.uid(), nullif(current_setting('app.motivo', true), ''));
  return null;
end $$;
create trigger cotas_historico_trg after insert or update on cotas
  for each row execute function _trg_hist_cotas();

create or replace function _trg_hist_setores() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.capacidade = old.capacidade then return null; end if;
  insert into cotas_historico (evento_id, setor, area_id, de, para, autor, motivo)
  values (new.evento_id, new.setor, null,
          case when tg_op = 'UPDATE' then old.capacidade end, new.capacidade,
          auth.uid(), nullif(current_setting('app.motivo', true), ''));
  return null;
end $$;
create trigger setores_historico_trg after insert or update on evento_setores
  for each row execute function _trg_hist_setores();

create or replace function _trg_pessoa_atualizada() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
create trigger pessoas_atualizado before update on pessoas
  for each row execute function _trg_pessoa_atualizada();

-- ---------------------------------------------------------------- saldo
create or replace function ocupados(p_evento uuid, p_setor setor, p_area uuid default null) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from ingressos
  where evento_id = p_evento and setor = p_setor
    and (p_area is null or area_id = p_area)
    and status_consome(status)
$$;

create or replace function saldo(p_evento uuid, p_setor setor, p_area uuid)
returns table (capacidade int, ocupados_setor int, cota int, ocupados_area int, saldo int, em_espera int, cota_por_area boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_cap int; v_por_area boolean; v_cota int; v_oc_setor int; v_oc_area int;
begin
  select es.capacidade, es.cota_por_area into v_cap, v_por_area
  from evento_setores es where es.evento_id = p_evento and es.setor = p_setor;
  if not found then return; end if;
  select c.quantidade into v_cota from cotas c where c.evento_id = p_evento and c.setor = p_setor and c.area_id = p_area;
  v_oc_setor := ocupados(p_evento, p_setor);
  v_oc_area := ocupados(p_evento, p_setor, p_area);
  return query select
    v_cap, v_oc_setor, v_cota, v_oc_area,
    greatest(0, least(
      v_cap - v_oc_setor,
      case when v_cota is not null then v_cota - v_oc_area
           when v_por_area then 0
           else v_cap - v_oc_setor end
    )),
    (select count(*)::int from ingressos i where i.evento_id = p_evento and i.setor = p_setor and i.area_id = p_area and i.status = 'lista_espera'),
    v_por_area;
end $$;

-- Trava o setor do evento (serializa reservas concorrentes) — chamar antes de _cabe
create or replace function _travar_setor(p_evento uuid, p_setor setor) returns void
language plpgsql as $$
begin
  perform 1 from evento_setores where evento_id = p_evento and setor = p_setor for update;
  if not found then
    raise exception 'SETOR_INEXISTENTE: este evento não tem ingressos de %', p_setor;
  end if;
end $$;

create or replace function _cabe(p_evento uuid, p_setor setor, p_area uuid, p_n int) returns boolean
language sql stable as $$
  select coalesce((select s.saldo >= p_n from saldo(p_evento, p_setor, p_area) s), false)
$$;

-- ---------------------------------------------------------------- pessoas e duplicidade
-- p: {nome, cpf, celular, email, colaborador}
create or replace function _upsert_pessoa(p jsonb, p_exigir_completo boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_nome text := limpar_nome(p ->> 'nome');
  v_cpf text := normalizar_cpf(p ->> 'cpf');
  v_cel text := nullif(regexp_replace(coalesce(p ->> 'celular', ''), '\D', '', 'g'), '');
  v_email text := nullif(lower(btrim(coalesce(p ->> 'email', ''))), '');
  v_colab boolean := coalesce((p ->> 'colaborador')::boolean, false);
  v_id uuid;
begin
  if p ->> 'cpf' is not null and btrim(p ->> 'cpf') <> '' and (v_cpf is null or not cpf_valido(v_cpf)) then
    raise exception 'CPF_INVALIDO: o CPF % de % não é válido', p ->> 'cpf', coalesce(v_nome, '(sem nome)');
  end if;
  if p_exigir_completo then
    if v_nome is null then raise exception 'DADOS_INCOMPLETOS: informe o nome completo'; end if;
    if v_cpf is null then raise exception 'DADOS_INCOMPLETOS: informe o CPF de %', v_nome; end if;
    if v_cel is null or length(v_cel) < 10 then raise exception 'DADOS_INCOMPLETOS: informe o celular (WhatsApp) de %', v_nome; end if;
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'EMAIL_INVALIDO: o e-mail % não é válido', v_email;
  end if;

  if v_cpf is null then
    insert into pessoas (nome, celular, email, colaborador_mrv)
    values (coalesce(v_nome, '(sem nome)'), v_cel, v_email, v_colab)
    returning id into v_id;
  else
    insert into pessoas (cpf, nome, celular, email, colaborador_mrv)
    values (v_cpf, coalesce(v_nome, '(sem nome)'), v_cel, v_email, v_colab)
    on conflict (cpf) do update set
      nome = case when excluded.nome = '(sem nome)' then pessoas.nome else excluded.nome end,
      celular = coalesce(excluded.celular, pessoas.celular),
      email = coalesce(excluded.email, pessoas.email),
      colaborador_mrv = pessoas.colaborador_mrv or excluded.colaborador_mrv
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function _checar_duplicado(p_evento uuid, p_pessoa uuid, p_ignorar uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  select i.setor, a.nome as area, i.status, p.nome, p.cpf into r
  from ingressos i join areas a on a.id = i.area_id join pessoas p on p.id = i.pessoa_id
  where i.evento_id = p_evento and i.pessoa_id = p_pessoa
    and i.status not in ('convite_expirado', 'recusado', 'cancelado')
    and not i.cpf_duplicado_liberado
    and (p_ignorar is null or i.id <> p_ignorar)
  limit 1;
  if found then
    raise exception 'CPF_DUPLICADO: % (CPF %) já está neste evento — %, área %, status %',
      r.nome, mascarar_cpf(r.cpf), r.setor, r.area, r.status;
  end if;
end $$;

-- ---------------------------------------------------------------- transições
create or replace function _mudar_status(p_ingresso uuid, p_para status_ingresso, p_autor_tipo text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
  t transicoes;
  v_papel papel_usuario := meu_papel();
begin
  select * into v_ing from ingressos where id = p_ingresso for update;
  if not found then raise exception 'NAO_ENCONTRADO: ingresso não encontrado'; end if;
  if v_ing.status = p_para then return; end if;

  select * into t from transicoes where de = v_ing.status and para = p_para;
  if not found then
    raise exception 'TRANSICAO_INVALIDA: não é possível passar de % para %', v_ing.status, p_para;
  end if;

  if p_autor_tipo = 'usuario' then
    if not (
      (v_papel in ('admin', 'marketing') and v_papel = any (t.papeis))
      or ('responsavel' = any (t.papeis) and responde_area(v_ing.area_id))
      or (v_papel = 'operacao' and 'operacao' = any (t.papeis))
    ) then
      raise exception 'SEM_PERMISSAO: seu perfil não pode passar de % para %', v_ing.status, p_para;
    end if;
  elsif p_autor_tipo = 'torcedor' then
    if not t.torcedor then raise exception 'SEM_PERMISSAO: ação não permitida pelo link'; end if;
  elsif not t.sistema then
    raise exception 'TRANSICAO_INVALIDA: transição % → % não é automática', v_ing.status, p_para;
  end if;

  perform _ctx(p_autor_tipo, p_motivo);
  update ingressos set
    status = p_para,
    facial_em = case when p_para = 'facial_ok' then now() else facial_em end,
    enviado_em = case when p_para = 'enviado' then now() else enviado_em end,
    recebido_em = case when p_para = 'confirmado' then now() else recebido_em end,
    checkin_em = case when p_para = 'presente' then now() when v_ing.status = 'presente' then null else checkin_em end,
    lista_espera_desde = case when p_para = 'lista_espera' then now() else lista_espera_desde end
  where id = p_ingresso;
end $$;

-- ---------------------------------------------------------------- lista de espera
-- Promove pedidos inteiros (titular + convidados) por ordem de chegada enquanto houver saldo na área.
create or replace function _promover_lista_espera(p_evento uuid, p_setor setor, p_area uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_pedido uuid;
  v_n int;
  v_total int := 0;
  v_id uuid;
begin
  perform _travar_setor(p_evento, p_setor);
  loop
    select pedido_id, count(*)::int into v_pedido, v_n
    from ingressos
    where evento_id = p_evento and setor = p_setor and area_id = p_area and status = 'lista_espera'
    group by pedido_id
    order by min(lista_espera_desde), pedido_id
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

create or replace function promover_lista_espera(p_evento uuid, p_setor setor, p_area uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_staff());
  return _promover_lista_espera(p_evento, p_setor, p_area);
end $$;

-- ---------------------------------------------------------------- eventos e cotas
-- p: {tipo, titulo, adversario, atracao, competicao, show_proprio, inicio, abertura_portoes,
--     prazo_solicitacao, prazo_validacao, concorrido, status, observacoes, duplicar_de}
create or replace function criar_evento(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_tipo tipo_evento := coalesce((p ->> 'tipo')::tipo_evento, 'jogo');
  v_origem uuid := nullif(p ->> 'duplicar_de', '')::uuid;
  v_padrao jsonb;
  v_setor text;
  v_cfg jsonb;
  v_slug text;
  v_qtd jsonb;
begin
  perform _exigir(eh_staff());
  insert into eventos (tipo, titulo, adversario, atracao, competicao, show_proprio, inicio, abertura_portoes,
                       prazo_solicitacao, prazo_validacao, concorrido, status, observacoes, duplicado_de, criado_por)
  values (v_tipo, p ->> 'titulo', p ->> 'adversario', p ->> 'atracao', p ->> 'competicao',
          (p ->> 'show_proprio')::boolean, (p ->> 'inicio')::timestamptz, (p ->> 'abertura_portoes')::timestamptz,
          (p ->> 'prazo_solicitacao')::timestamptz, (p ->> 'prazo_validacao')::timestamptz,
          coalesce((p ->> 'concorrido')::boolean, false), coalesce((p ->> 'status')::status_evento, 'rascunho'),
          p ->> 'observacoes', v_origem, auth.uid())
  returning id into v_id;

  perform _ctx('usuario', case when v_origem is null then 'cota padrão do regulamento' else 'duplicado de evento anterior' end);
  if v_origem is not null then
    insert into evento_setores (evento_id, setor, capacidade, cota_por_area)
    select v_id, setor, capacidade, cota_por_area from evento_setores where evento_id = v_origem;
    insert into cotas (evento_id, setor, area_id, quantidade, sob_demanda)
    select v_id, setor, area_id, quantidade, sob_demanda from cotas where evento_id = v_origem;
  else
    select valor -> v_tipo::text into v_padrao from config where chave = 'cotas_padrao';
    for v_setor, v_cfg in select * from jsonb_each(coalesce(v_padrao, '{}'::jsonb)) loop
      insert into evento_setores (evento_id, setor, capacidade, cota_por_area)
      values (v_id, v_setor::setor, (v_cfg ->> 'capacidade')::int, coalesce((v_cfg ->> 'cota_por_area')::boolean, true));
      for v_slug, v_qtd in select * from jsonb_each(coalesce(v_cfg -> 'areas', '{}'::jsonb)) loop
        insert into cotas (evento_id, setor, area_id, quantidade, sob_demanda)
        select v_id, v_setor::setor, a.id,
               case when jsonb_typeof(v_qtd) = 'object' then (v_qtd ->> 'quantidade')::int else v_qtd::text::int end,
               case when jsonb_typeof(v_qtd) = 'object' then coalesce((v_qtd ->> 'sob_demanda')::boolean, false) else false end
        from areas a where a.slug = v_slug;
      end loop;
    end loop;
  end if;
  perform registrar_auditoria('criar', 'evento', v_id::text, p);
  return v_id;
end $$;

-- p_area null = capacidade do setor
create or replace function ajustar_cota(p_evento uuid, p_setor setor, p_area uuid, p_quantidade int, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ocupados int;
begin
  perform _exigir(eh_staff());
  perform _exigir(p_quantidade >= 0, 'VALOR_INVALIDO: a cota não pode ser negativa');
  perform _exigir(nullif(btrim(coalesce(p_motivo, '')), '') is not null, 'MOTIVO_OBRIGATORIO: informe o motivo da alteração');
  perform _travar_setor(p_evento, p_setor);
  v_ocupados := ocupados(p_evento, p_setor, p_area);
  if p_quantidade < v_ocupados then
    raise exception 'COTA_ABAIXO_DO_USO: já há % ingressos ocupados; cancele ou remaneje antes de reduzir para %', v_ocupados, p_quantidade;
  end if;
  perform _ctx('usuario', p_motivo);
  if p_area is null then
    update evento_setores set capacidade = p_quantidade where evento_id = p_evento and setor = p_setor;
    for p_area in select area_id from cotas where evento_id = p_evento and setor = p_setor loop
      perform _promover_lista_espera(p_evento, p_setor, p_area);
    end loop;
  else
    insert into cotas (evento_id, setor, area_id, quantidade) values (p_evento, p_setor, p_area, p_quantidade)
    on conflict (evento_id, setor, area_id) do update set quantidade = excluded.quantidade;
    perform _promover_lista_espera(p_evento, p_setor, p_area);
  end if;
end $$;

create or replace function remanejar_cota(p_evento uuid, p_setor setor, p_de uuid, p_para uuid, p_qtd int, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_de int; v_para int;
begin
  perform _exigir(eh_staff());
  perform _exigir(p_qtd > 0, 'VALOR_INVALIDO: informe uma quantidade positiva');
  select quantidade into v_de from cotas where evento_id = p_evento and setor = p_setor and area_id = p_de;
  select quantidade into v_para from cotas where evento_id = p_evento and setor = p_setor and area_id = p_para;
  perform ajustar_cota(p_evento, p_setor, p_de, coalesce(v_de, 0) - p_qtd, p_motivo);
  perform ajustar_cota(p_evento, p_setor, p_para, coalesce(v_para, 0) + p_qtd, p_motivo);
end $$;

-- Ao fechar o prazo, o saldo não usado de cada área volta para o pool do setor
create or replace function fechar_prazo(p_evento uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_devolvido int := 0;
  v_oc int;
begin
  if auth.uid() is not null then perform _exigir(eh_staff()); end if;
  perform _ctx(case when auth.uid() is null then 'sistema' else 'usuario' end, 'prazo encerrado: saldo devolvido ao pool');
  for c in select * from cotas where evento_id = p_evento and not sob_demanda order by setor loop
    perform _travar_setor(c.evento_id, c.setor);
    v_oc := ocupados(c.evento_id, c.setor, c.area_id);
    if c.quantidade > v_oc then
      update cotas set quantidade = v_oc where evento_id = c.evento_id and setor = c.setor and area_id = c.area_id;
      v_devolvido := v_devolvido + (c.quantidade - v_oc);
    end if;
  end loop;
  update eventos set status = 'fechado' where id = p_evento and status = 'aberto';
  return v_devolvido;
end $$;

-- ---------------------------------------------------------------- pedidos (Modo A, Marketing, importação)
-- p_pessoas: [{nome, cpf, celular, email, colaborador, status?, observacao?}]; a 1ª é o titular,
--            as demais ficam como "convidado de" titular.
-- p_opcoes: {origem, lista_espera (default true), liberar_duplicado, ignorar_cota, prioridade,
--            catering, centro_custo, indicacao_de, observacao, motivo}
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

  insert into pedidos (evento_id, setor, area_id, origem, solicitante, prioridade, catering, centro_custo, indicacao_de, observacao)
  values (p_evento, p_setor, p_area, v_origem, auth.uid(),
          (p_opcoes ->> 'prioridade')::prioridade_camarote, (p_opcoes ->> 'catering')::tipo_catering,
          p_opcoes ->> 'centro_custo', limpar_nome(p_opcoes ->> 'indicacao_de'), p_opcoes ->> 'observacao')
  returning id into v_pedido;

  perform _ctx('usuario', coalesce(p_opcoes ->> 'motivo', case when v_status = 'lista_espera' then 'cota esgotada: entrou na lista de espera' end));
  for p in select * from jsonb_array_elements(p_pessoas) loop
    i := i + 1;
    v_pessoa := _upsert_pessoa(p || jsonb_build_object('colaborador', coalesce((p ->> 'colaborador')::boolean, i = 1 and p_setor <> 'camarote')),
                               not v_importacao);
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

-- Edita os dados de uma pessoa enquanto o pedido ainda não foi aprovado
create or replace function editar_pessoa_ingresso(p_ingresso uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
  v_pessoa uuid;
begin
  select * into v_ing from ingressos where id = p_ingresso for update;
  perform _exigir(found and responde_area(v_ing.area_id));
  perform _exigir(eh_staff() or v_ing.status in ('solicitado', 'lista_espera'),
                  'JA_VALIDADO: depois da validação só o Marketing pode alterar os dados');
  v_pessoa := _upsert_pessoa(p, true);
  if not v_ing.cpf_duplicado_liberado then perform _checar_duplicado(v_ing.evento_id, v_pessoa, v_ing.id); end if;
  update ingressos set pessoa_id = v_pessoa where id = p_ingresso;
  perform registrar_auditoria('alterar', 'ingresso', p_ingresso::text, jsonb_build_object('pessoa_anterior', v_ing.pessoa_id, 'pessoa_nova', v_pessoa));
end $$;

-- ---------------------------------------------------------------- convites (Modo B)
create or replace function criar_convite(p_evento uuid, p_setor setor, p_area uuid, p_qtd int,
                                         p_nome_previsto text, p_contato text default null,
                                         p_expira_em timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ev eventos;
  v_pedido uuid;
  v_convite convites;
  v_expira timestamptz;
begin
  perform _exigir(responde_area(p_area));
  perform _exigir(eh_staff() or p_setor <> 'camarote', 'CAMAROTE_MARKETING: convites de camarote são gerados pelo Marketing MRV');
  perform _exigir(p_qtd between 1 and 10, 'VALOR_INVALIDO: um convite vale de 1 a 10 lugares');
  select * into v_ev from eventos where id = p_evento;
  perform _exigir(found, 'NAO_ENCONTRADO: evento não encontrado');
  if not eh_staff() then
    perform _exigir(v_ev.status = 'aberto', 'EVENTO_FECHADO: o evento não está aberto para solicitações');
  end if;
  v_expira := coalesce(p_expira_em, v_ev.prazo_solicitacao, v_ev.inicio - interval '1 day');
  if v_ev.prazo_solicitacao is not null and v_expira > v_ev.prazo_solicitacao and not eh_staff() then
    v_expira := v_ev.prazo_solicitacao;
  end if;
  perform _exigir(v_expira > now(), 'VALOR_INVALIDO: a validade do convite precisa estar no futuro');

  perform _travar_setor(p_evento, p_setor);
  if not _cabe(p_evento, p_setor, p_area, p_qtd) then
    raise exception 'COTA_EXCEDIDA: a área não tem saldo para % lugar(es) (saldo: %)',
      p_qtd, (select s.saldo from saldo(p_evento, p_setor, p_area) s);
  end if;

  insert into pedidos (evento_id, setor, area_id, origem, solicitante, indicacao_de)
  values (p_evento, p_setor, p_area, 'convite', auth.uid(), limpar_nome(p_nome_previsto))
  returning id into v_pedido;
  insert into convites (pedido_id, evento_id, setor, area_id, qtd_lugares, nome_previsto, contato, expira_em, criado_por)
  values (v_pedido, p_evento, p_setor, p_area, p_qtd, limpar_nome(p_nome_previsto), p_contato, v_expira, auth.uid())
  returning * into v_convite;

  perform _ctx('usuario', 'vaga reservada para ' || coalesce(limpar_nome(p_nome_previsto), 'convidado'));
  insert into ingressos (evento_id, setor, area_id, pedido_id, convite_id, status)
  select p_evento, p_setor, p_area, v_pedido, v_convite.id, 'convite_enviado' from generate_series(1, p_qtd);

  return jsonb_build_object('convite_id', v_convite.id, 'token', v_convite.token, 'expira_em', v_expira);
end $$;

create or replace function _encerrar_convite(p_convite uuid, p_status status_convite, p_autor_tipo text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_conv convites;
  v_id uuid;
begin
  select * into v_conv from convites where id = p_convite for update;
  if v_conv.status <> 'aguardando' then return; end if;
  update convites set status = p_status where id = p_convite;
  for v_id in select id from ingressos where convite_id = p_convite and status in ('convite_enviado', 'aguardando_preenchimento') loop
    perform _mudar_status(v_id, case when p_status = 'expirado' then 'convite_expirado'::status_ingresso else 'cancelado'::status_ingresso end,
                          p_autor_tipo, p_motivo);
  end loop;
  perform _promover_lista_espera(v_conv.evento_id, v_conv.setor, v_conv.area_id);
end $$;

create or replace function cancelar_convite(p_convite uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_area uuid;
begin
  select area_id into v_area from convites where id = p_convite;
  perform _exigir(responde_area(v_area));
  perform _encerrar_convite(p_convite, 'cancelado', 'sistema', 'convite cancelado pelo responsável');
end $$;

-- Cron: devolve ao saldo as vagas de convites vencidos
create or replace function expirar_convites() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in select id from convites where status = 'aguardando' and expira_em <= now() loop
    perform _encerrar_convite(v_id, 'expirado', 'sistema', 'convite expirou sem preenchimento');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Público (via servidor, service role): dados para a página /i/[token]
create or replace function consultar_link(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_conv convites;
  v_ing ingressos;
  v_ev eventos;
  v_area text;
  v_ingressos jsonb;
begin
  select * into v_conv from convites where token = p_token;
  if found then
    select * into v_ev from eventos where id = v_conv.evento_id;
    select nome into v_area from areas where id = v_conv.area_id;
    if v_conv.status = 'aguardando' and v_conv.expira_em > now() and v_conv.aberto_em is null then
      update convites set aberto_em = now() where id = v_conv.id;
      perform _ctx('torcedor', 'convidado abriu o link');
      update ingressos set status = 'aguardando_preenchimento'
      where convite_id = v_conv.id and status = 'convite_enviado';
    end if;
    select jsonb_agg(jsonb_build_object('token', i.token, 'nome', p.nome, 'status', i.status) order by i.criado_em, i.id)
      into v_ingressos
    from ingressos i left join pessoas p on p.id = i.pessoa_id
    where i.convite_id = v_conv.id and i.pessoa_id is not null;
    return jsonb_build_object(
      'tipo', 'convite',
      'status', case when v_conv.status = 'aguardando' and v_conv.expira_em <= now() then 'expirado' else v_conv.status::text end,
      'qtd_lugares', v_conv.qtd_lugares, 'nome_previsto', v_conv.nome_previsto, 'expira_em', v_conv.expira_em,
      'setor', v_conv.setor, 'area', v_area, 'evento', to_jsonb(v_ev) - 'criado_por' - 'observacoes',
      'ingressos', coalesce(v_ingressos, '[]'::jsonb));
  end if;

  select * into v_ing from ingressos where token = p_token;
  if not found then return null; end if;
  select * into v_ev from eventos where id = v_ing.evento_id;
  select nome into v_area from areas where id = v_ing.area_id;
  return jsonb_build_object(
    'tipo', 'ingresso',
    'status', v_ing.status, 'setor', v_ing.setor, 'area', v_area,
    'evento', to_jsonb(v_ev) - 'criado_por' - 'observacoes',
    'pessoa', (select jsonb_build_object('nome', p.nome, 'cpf', mascarar_cpf(p.cpf)) from pessoas p where p.id = v_ing.pessoa_id),
    'convidado_de', (select p.nome from ingressos t join pessoas p on p.id = t.pessoa_id where t.id = v_ing.convidado_de),
    'facial_em', v_ing.facial_em, 'enviado_em', v_ing.enviado_em, 'recebido_em', v_ing.recebido_em);
end $$;

-- Público: o convidado preenche os próprios dados (e dos acompanhantes, se o link valer para mais de 1)
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
    perform _mudar_status(v_vagas[i], 'solicitado', 'torcedor', 'preenchido pelo convidado');
    update ingressos set pessoa_id = v_pessoa, preenchido_por = 'convidado',
                         convidado_de = case when i > 1 then v_titular end
    where id = v_vagas[i];
    if i = 1 then v_titular := v_vagas[i]; end if;
    v_tokens := v_tokens || jsonb_build_object('token', (select token from ingressos where id = v_vagas[i]),
                                               'nome', (select nome from pessoas where id = v_pessoa));
  end loop;
  -- lugares não usados voltam para o saldo da área
  for i in v_n + 1 .. coalesce(array_length(v_vagas, 1), 0) loop
    perform _mudar_status(v_vagas[i], 'cancelado', 'torcedor', 'lugar não utilizado pelo convidado');
  end loop;

  update pedidos set titular_ingresso_id = v_titular where id = v_conv.pedido_id;
  update convites set status = 'preenchido', preenchido_em = now() where id = v_conv.id;
  if v_n < coalesce(array_length(v_vagas, 1), 0) then
    perform _promover_lista_espera(v_conv.evento_id, v_conv.setor, v_conv.area_id);
  end if;
  return jsonb_build_object('ingressos', v_tokens);
end $$;

-- ---------------------------------------------------------------- validação, aprovação, envio
create or replace function validar_lista(p_evento uuid, p_setor setor, p_area uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  perform _exigir(responde_area(p_area));
  for v_id in select id from ingressos
              where evento_id = p_evento and setor = p_setor and area_id = p_area and status = 'solicitado' loop
    perform _mudar_status(v_id, 'validado_area', 'usuario', 'lista validada pela área');
    v_n := v_n + 1;
  end loop;
  insert into validacoes (evento_id, setor, area_id, validado_por, qtd) values (p_evento, p_setor, p_area, auth.uid(), v_n);
  return v_n;
end $$;

create or replace function _em_lote(p_ids uuid[], p_para status_ingresso, p_motivo text, p_de status_ingresso[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in select id from ingressos where id = any (p_ids) and (p_de is null or status = any (p_de)) order by criado_em loop
    perform _mudar_status(v_id, p_para, 'usuario', p_motivo);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function aprovar_ingressos(p_ids uuid[]) returns int
language sql security definer set search_path = public as $$
  select _em_lote(p_ids, 'aprovado', 'aprovado pelo Marketing', array['validado_area']::status_ingresso[])
$$;

create or replace function recusar_ingressos(p_ids uuid[], p_motivo text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  r record;
begin
  v_n := _em_lote(p_ids, 'recusado', coalesce(nullif(p_motivo, ''), 'recusado pelo Marketing'));
  for r in select distinct evento_id, setor, area_id from ingressos where id = any (p_ids) loop
    perform _promover_lista_espera(r.evento_id, r.setor, r.area_id);
  end loop;
  return v_n;
end $$;

-- Orientação do Galo ID enviada (WhatsApp/e-mail) → aguardando a facial
create or replace function marcar_orientacao_enviada(p_ids uuid[]) returns int
language sql security definer set search_path = public as $$
  select _em_lote(p_ids, 'facial_pendente', 'passo a passo do Galo ID enviado', array['aprovado']::status_ingresso[])
$$;

create or replace function marcar_facial_ok(p_ids uuid[]) returns int
language sql security definer set search_path = public as $$
  select _em_lote(p_ids, 'facial_ok', 'facial confirmada pela equipe', array['aprovado', 'facial_pendente']::status_ingresso[])
$$;

-- Ingresso enviado no sistema do Atlético. Sem facial confirmada só com p_forcar (fica registrado).
create or replace function marcar_enviados(p_ids uuid[], p_forcar boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  perform _exigir(eh_staff());
  v_n := _em_lote(p_ids, 'enviado', 'ingresso enviado no sistema do Atlético', array['facial_ok']::status_ingresso[]);
  if p_forcar then
    v_n := v_n + _em_lote(p_ids, 'enviado', 'enviado sem confirmação da facial', array['aprovado', 'facial_pendente']::status_ingresso[]);
  end if;
  perform registrar_auditoria('marcar_enviados', 'ingresso', null, jsonb_build_object('ids', p_ids, 'forcar', p_forcar, 'qtd', v_n));
  return v_n;
end $$;

-- "Pedi mas não vou": libera o lugar e puxa a lista de espera
create or replace function cancelar_ingressos(p_ids uuid[], p_motivo text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  r record;
begin
  v_n := _em_lote(p_ids, 'cancelado', coalesce(nullif(p_motivo, ''), 'cancelado'),
                  array['solicitado', 'validado_area', 'aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'lista_espera']::status_ingresso[]);
  for r in select distinct evento_id, setor, area_id from ingressos where id = any (p_ids) loop
    perform _promover_lista_espera(r.evento_id, r.setor, r.area_id);
  end loop;
  return v_n;
end $$;

-- Público (via servidor): ações do torcedor pelo link
create or replace function acao_torcedor(p_token text, p_acao text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
begin
  select * into v_ing from ingressos where token = p_token;
  perform _exigir(found, 'NAO_ENCONTRADO: link inválido');
  if p_acao = 'facial_ok' then
    perform _exigir(v_ing.status in ('aprovado', 'facial_pendente'), 'TRANSICAO_INVALIDA: seu pedido ainda não foi aprovado');
    perform _mudar_status(v_ing.id, 'facial_ok', 'torcedor', 'torcedor confirmou a facial no Galo ID');
  elsif p_acao = 'recebido' then
    perform _exigir(v_ing.status = 'enviado', 'TRANSICAO_INVALIDA: o ingresso ainda não foi enviado');
    perform _mudar_status(v_ing.id, 'confirmado', 'torcedor', 'torcedor confirmou o recebimento');
  elsif p_acao = 'cancelar' then
    perform _mudar_status(v_ing.id, 'cancelado', 'torcedor', 'torcedor cancelou pelo link');
    perform _promover_lista_espera(v_ing.evento_id, v_ing.setor, v_ing.area_id);
  else
    raise exception 'VALOR_INVALIDO: ação desconhecida';
  end if;
  return (select status::text from ingressos where id = v_ing.id);
end $$;

-- ---------------------------------------------------------------- leitura
-- Lista da área: CPF completo só para Admin/Marketing
create or replace function lista_area(p_evento uuid, p_setor setor, p_area uuid)
returns table (
  ingresso_id uuid, pedido_id uuid, convite_id uuid, status status_ingresso, preenchido_por preenchido_por,
  nome text, cpf text, celular text, email text, convidado_de_nome text, titular boolean,
  token text, criado_em timestamptz, convite_nome_previsto text, convite_expira_em timestamptz, convite_status status_convite,
  convite_token text, convite_contato text, convite_qtd int, indicacao_de text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_staff boolean := eh_staff();
begin
  perform _exigir(responde_area(p_area));
  return query
  select i.id, i.pedido_id, i.convite_id, i.status, i.preenchido_por,
         p.nome, case when v_staff then p.cpf else mascarar_cpf(p.cpf) end, p.celular, p.email,
         pt.nome, i.convidado_de is null, i.token, i.criado_em,
         c.nome_previsto, c.expira_em, c.status, c.token, c.contato, c.qtd_lugares, pe.indicacao_de
  from ingressos i
  join pedidos pe on pe.id = i.pedido_id
  left join pessoas p on p.id = i.pessoa_id
  left join ingressos t on t.id = i.convidado_de
  left join pessoas pt on pt.id = t.pessoa_id
  left join convites c on c.id = i.convite_id
  where i.evento_id = p_evento and i.setor = p_setor and i.area_id = p_area
  order by i.pedido_id, i.convidado_de nulls first, i.criado_em;
end $$;

-- Visão completa para Marketing/Admin (RLS de pessoas restringe a staff)
create or replace view v_ingressos with (security_invoker = true) as
select i.*, p.nome, p.cpf, p.celular, p.email, a.nome as area_nome, a.ordem as area_ordem,
       pt.nome as convidado_de_nome, pe.indicacao_de, pe.origem, pe.prioridade, pe.catering, pe.centro_custo,
       pe.observacao as pedido_observacao
from ingressos i
join areas a on a.id = i.area_id
join pedidos pe on pe.id = i.pedido_id
left join pessoas p on p.id = i.pessoa_id
left join ingressos t on t.id = i.convidado_de
left join pessoas pt on pt.id = t.pessoa_id;
