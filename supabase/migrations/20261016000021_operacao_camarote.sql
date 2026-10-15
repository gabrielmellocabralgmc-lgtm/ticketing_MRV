-- Operação do camarote: check-list antes e depois do jogo, controle de bebidas (com a sobra
-- do jogo anterior), relatório geral e fotos de comprovação com horário de envio.
-- Acesso: perfil Operação do camarote e Admin.

create or replace function eh_operacao() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(meu_papel() in ('admin', 'operacao'), false)
$$;

-- ---------------------------------------------------------------- itens do check-list (configuráveis)
create table op_itens (
  id uuid primary key default gen_random_uuid(),
  momento text not null check (momento in ('antes', 'depois')),
  secao text not null,
  texto text not null,
  dica text,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- check-list de cada jogo
create table op_checklists (
  evento_id uuid not null references eventos (id) on delete cascade,
  momento text not null check (momento in ('antes', 'depois')),
  concluido_em timestamptz,
  concluido_por uuid,
  primary key (evento_id, momento)
);

create table op_respostas (
  evento_id uuid not null references eventos (id) on delete cascade,
  item_id uuid not null references op_itens (id),
  status text not null check (status in ('ok', 'problema', 'na')),
  observacao text check (length(observacao) <= 1000),
  respondido_em timestamptz not null default now(),
  respondido_por uuid,
  primary key (evento_id, item_id)
);

-- ---------------------------------------------------------------- bebidas
create table op_bebidas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  unidade text not null default 'un.',
  ordem int not null default 0,
  ativo boolean not null default true
);

-- por jogo: sobra do anterior (calculada), contratado, contagem antes e depois
create table op_bebidas_jogo (
  evento_id uuid not null references eventos (id) on delete cascade,
  bebida_id uuid not null references op_bebidas (id),
  contratado int check (contratado >= 0),
  contagem_inicial int check (contagem_inicial >= 0),
  contagem_final int check (contagem_final >= 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (evento_id, bebida_id)
);

-- ---------------------------------------------------------------- relatório geral
create table op_relatorios (
  evento_id uuid primary key references eventos (id) on delete cascade,
  abertura_camarote time,
  encerramento_camarote time,
  avaliacao int check (avaliacao between 1 and 5),
  resumo text check (length(resumo) <= 5000),
  ocorrencias text check (length(ocorrencias) <= 5000),
  manutencao text check (length(manutencao) <= 5000),
  feedback text check (length(feedback) <= 5000),
  finalizado_em timestamptz,
  finalizado_por uuid,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

-- ---------------------------------------------------------------- fotos (arquivo no Storage; aqui só o registro)
create table op_fotos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos (id) on delete cascade,
  momento text check (momento in ('antes', 'depois', 'relatorio')),
  item_id uuid references op_itens (id),
  caminho text not null unique,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  tamanho int not null check (tamanho between 1 and 5 * 1024 * 1024),
  legenda text check (length(legenda) <= 300),
  tirada_em timestamptz,               -- data do arquivo no celular (informativa)
  enviado_em timestamptz not null default now(),  -- horário oficial: quando chegou ao sistema
  enviado_por uuid
);
create index op_fotos_evento on op_fotos (evento_id, enviado_em);

-- leitura direta só para Operação/Admin; escrita só pelas funções abaixo
do $$
declare t text;
begin
  foreach t in array array['op_itens', 'op_checklists', 'op_respostas', 'op_bebidas', 'op_bebidas_jogo', 'op_relatorios', 'op_fotos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (eh_operacao())', t || '_leitura', t);
    execute format('grant select on %I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- funções
create or replace function _op_aberto(p_evento uuid, p_momento text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_operacao());
  perform _exigir(exists (select 1 from eventos where id = p_evento), 'NAO_ENCONTRADO: evento não encontrado');
  if p_momento is not null then
    perform _exigir(not exists (select 1 from op_checklists where evento_id = p_evento and momento = p_momento and concluido_em is not null),
      'JA_CONCLUIDO: este check-list já foi concluído. Reabra para alterar.');
  end if;
end $$;

create or replace function op_responder(p_evento uuid, p_item uuid, p_status text, p_observacao text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_momento text;
begin
  select momento into v_momento from op_itens where id = p_item;
  perform _exigir(found, 'NAO_ENCONTRADO: item não encontrado');
  perform _op_aberto(p_evento, v_momento);
  perform _exigir(p_status in ('ok', 'problema', 'na'), 'VALOR_INVALIDO: status inválido');
  perform _exigir(p_status <> 'problema' or nullif(btrim(coalesce(p_observacao, '')), '') is not null,
    'MOTIVO_OBRIGATORIO: descreva o problema encontrado');
  insert into op_respostas (evento_id, item_id, status, observacao, respondido_por)
  values (p_evento, p_item, p_status, nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid())
  on conflict (evento_id, item_id) do update
    set status = excluded.status, observacao = excluded.observacao, respondido_em = now(), respondido_por = auth.uid();
end $$;

-- Concluir exige todos os itens respondidos (e, no "depois", a contagem final das bebidas)
create or replace function op_concluir(p_evento uuid, p_momento text) returns void
language plpgsql security definer set search_path = public as $$
declare v_faltam int;
begin
  perform _op_aberto(p_evento, p_momento);
  select count(*) into v_faltam from op_itens i
  where i.ativo and i.momento = p_momento
    and not exists (select 1 from op_respostas r where r.evento_id = p_evento and r.item_id = i.id);
  perform _exigir(v_faltam = 0, format('INCOMPLETO: faltam %s item(ns) do check-list', v_faltam));
  if p_momento = 'antes' then
    perform _exigir(not exists (select 1 from op_bebidas b where b.ativo and not exists (
      select 1 from op_bebidas_jogo j where j.evento_id = p_evento and j.bebida_id = b.id and j.contagem_inicial is not null)),
      'INCOMPLETO: falta a contagem das bebidas antes do jogo');
  else
    perform _exigir(not exists (select 1 from op_bebidas b where b.ativo and not exists (
      select 1 from op_bebidas_jogo j where j.evento_id = p_evento and j.bebida_id = b.id and j.contagem_final is not null)),
      'INCOMPLETO: falta a contagem final das bebidas');
  end if;
  insert into op_checklists (evento_id, momento, concluido_em, concluido_por) values (p_evento, p_momento, now(), auth.uid())
  on conflict (evento_id, momento) do update set concluido_em = now(), concluido_por = auth.uid();
end $$;

create or replace function op_reabrir(p_evento uuid, p_momento text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_operacao());
  update op_checklists set concluido_em = null, concluido_por = null where evento_id = p_evento and momento = p_momento;
  perform registrar_auditoria('alterar', 'op_checklist', p_evento::text, jsonb_build_object('acao', 'reabrir', 'momento', p_momento));
end $$;

-- Bebidas do jogo + sobra do último jogo anterior que teve contagem final
create or replace function op_bebidas_do_jogo(p_evento uuid)
returns table (bebida_id uuid, nome text, unidade text, sobra_anterior int, jogo_anterior text,
               contratado int, contagem_inicial int, contagem_final int)
language plpgsql stable security definer set search_path = public as $$
declare v_inicio timestamptz;
begin
  perform _exigir(eh_operacao());
  select inicio into v_inicio from eventos where id = p_evento;
  return query
  select b.id, b.nome, b.unidade, ant.contagem_final, ant.titulo, j.contratado, j.contagem_inicial, j.contagem_final
  from op_bebidas b
  left join op_bebidas_jogo j on j.evento_id = p_evento and j.bebida_id = b.id
  left join lateral (
    select x.contagem_final, e.titulo from op_bebidas_jogo x join eventos e on e.id = x.evento_id
    where x.bebida_id = b.id and x.contagem_final is not null and e.inicio < v_inicio and e.id <> p_evento
    order by e.inicio desc limit 1
  ) ant on true
  where b.ativo or j.bebida_id is not null
  order by b.ordem, b.nome;
end $$;

-- p_linhas: [{bebida_id, contratado, contagem_inicial, contagem_final}] (campo ausente = não altera)
create or replace function op_salvar_bebidas(p_evento uuid, p_linhas jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare l jsonb;
begin
  perform _exigir(eh_operacao());
  for l in select * from jsonb_array_elements(coalesce(p_linhas, '[]')) loop
    -- cada contagem fica travada quando o check-list do respectivo momento é concluído
    if l ? 'contagem_inicial' or l ? 'contratado' then perform _op_aberto(p_evento, 'antes'); end if;
    if l ? 'contagem_final' then perform _op_aberto(p_evento, 'depois'); end if;
    insert into op_bebidas_jogo (evento_id, bebida_id, contratado, contagem_inicial, contagem_final, atualizado_por)
    values (p_evento, (l ->> 'bebida_id')::uuid, (l ->> 'contratado')::int, (l ->> 'contagem_inicial')::int, (l ->> 'contagem_final')::int, auth.uid())
    on conflict (evento_id, bebida_id) do update set
      contratado = case when l ? 'contratado' then excluded.contratado else op_bebidas_jogo.contratado end,
      contagem_inicial = case when l ? 'contagem_inicial' then excluded.contagem_inicial else op_bebidas_jogo.contagem_inicial end,
      contagem_final = case when l ? 'contagem_final' then excluded.contagem_final else op_bebidas_jogo.contagem_final end,
      atualizado_em = now(), atualizado_por = auth.uid();
  end loop;
end $$;

create or replace function op_salvar_relatorio(p_evento uuid, p jsonb, p_finalizar boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_operacao());
  perform _exigir(not exists (select 1 from op_relatorios where evento_id = p_evento and finalizado_em is not null),
    'JA_CONCLUIDO: o relatório já foi finalizado. Reabra para alterar.');
  insert into op_relatorios (evento_id, abertura_camarote, encerramento_camarote, avaliacao, resumo, ocorrencias, manutencao, feedback,
                             finalizado_em, finalizado_por, atualizado_por)
  values (p_evento, nullif(p ->> 'abertura_camarote', '')::time, nullif(p ->> 'encerramento_camarote', '')::time,
          nullif(p ->> 'avaliacao', '')::int, nullif(btrim(p ->> 'resumo'), ''), nullif(btrim(p ->> 'ocorrencias'), ''),
          nullif(btrim(p ->> 'manutencao'), ''), nullif(btrim(p ->> 'feedback'), ''),
          case when p_finalizar then now() end, case when p_finalizar then auth.uid() end, auth.uid())
  on conflict (evento_id) do update set
    abertura_camarote = excluded.abertura_camarote, encerramento_camarote = excluded.encerramento_camarote,
    avaliacao = excluded.avaliacao, resumo = excluded.resumo, ocorrencias = excluded.ocorrencias,
    manutencao = excluded.manutencao, feedback = excluded.feedback,
    finalizado_em = excluded.finalizado_em, finalizado_por = excluded.finalizado_por,
    atualizado_em = now(), atualizado_por = auth.uid();
end $$;

create or replace function op_reabrir_relatorio(p_evento uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_operacao());
  update op_relatorios set finalizado_em = null, finalizado_por = null where evento_id = p_evento;
end $$;

-- O arquivo vai para o Storage pelo servidor; aqui só registra (horário oficial = agora)
create or replace function op_registrar_foto(p_evento uuid, p_momento text, p_item uuid, p_caminho text, p_mime text,
                                             p_tamanho int, p_legenda text default null, p_tirada_em timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v op_fotos;
begin
  perform _exigir(eh_operacao());
  insert into op_fotos (evento_id, momento, item_id, caminho, mime, tamanho, legenda, tirada_em, enviado_por)
  values (p_evento, p_momento, p_item, p_caminho, p_mime, p_tamanho, nullif(btrim(coalesce(p_legenda, '')), ''), p_tirada_em, auth.uid())
  returning * into v;
  return jsonb_build_object('id', v.id, 'enviado_em', v.enviado_em);
end $$;

create or replace function op_remover_foto(p_foto uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_caminho text;
begin
  perform _exigir(eh_operacao());
  delete from op_fotos where id = p_foto returning caminho into v_caminho;
  perform registrar_auditoria('alterar', 'op_foto', p_foto::text, jsonb_build_object('acao', 'remover'));
  return v_caminho;
end $$;

-- Admin ajusta os itens do check-list e o catálogo de bebidas
create or replace function op_salvar_item(p_id uuid, p_momento text, p_secao text, p_texto text, p_dica text, p_ordem int, p_ativo boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  perform _exigir(eh_admin());
  perform _exigir(nullif(btrim(p_texto), '') is not null and nullif(btrim(p_secao), '') is not null, 'DADOS_INCOMPLETOS: informe a seção e o item');
  if v_id is null then
    insert into op_itens (momento, secao, texto, dica, ordem, ativo) values (p_momento, btrim(p_secao), btrim(p_texto), nullif(btrim(p_dica), ''), p_ordem, p_ativo)
    returning id into v_id;
  else
    update op_itens set momento = p_momento, secao = btrim(p_secao), texto = btrim(p_texto), dica = nullif(btrim(p_dica), ''),
                        ordem = p_ordem, ativo = p_ativo where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function op_salvar_bebida(p_id uuid, p_nome text, p_unidade text, p_ordem int, p_ativo boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  perform _exigir(eh_admin());
  perform _exigir(nullif(btrim(p_nome), '') is not null, 'DADOS_INCOMPLETOS: informe o nome da bebida');
  if v_id is null then
    insert into op_bebidas (nome, unidade, ordem, ativo) values (btrim(p_nome), coalesce(nullif(btrim(p_unidade), ''), 'un.'), p_ordem, p_ativo)
    returning id into v_id;
  else
    update op_bebidas set nome = btrim(p_nome), unidade = coalesce(nullif(btrim(p_unidade), ''), 'un.'), ordem = p_ordem, ativo = p_ativo where id = v_id;
  end if;
  return v_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'op_responder(uuid, uuid, text, text)', 'op_concluir(uuid, text)', 'op_reabrir(uuid, text)', 'op_bebidas_do_jogo(uuid)',
    'op_salvar_bebidas(uuid, jsonb)', 'op_salvar_relatorio(uuid, jsonb, boolean)', 'op_reabrir_relatorio(uuid)',
    'op_registrar_foto(uuid, text, uuid, text, text, int, text, timestamptz)', 'op_remover_foto(uuid)',
    'op_salvar_item(uuid, text, text, text, text, int, boolean)', 'op_salvar_bebida(uuid, text, text, int, boolean)', 'eh_operacao()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  execute 'revoke execute on function _op_aberto(uuid, text) from public, anon, authenticated';
end $$;

-- ---------------------------------------------------------------- itens padrão
insert into op_itens (momento, secao, texto, dica, ordem) values
  ('antes', 'A&B', 'Contratação de buffet para o jogo confirmada', 'Se não houver buffet neste jogo, marque "Não se aplica".', 10),
  ('antes', 'A&B', 'Bebidas conferidas (contagem na aba Bebidas)', 'Sobra do jogo anterior + volume contratado para este jogo.', 20),
  ('antes', 'A&B', 'Geladeira ligada e funcionando', null, 30),
  ('antes', 'A&B', 'Choppeira ligada e funcionando', 'Se não houver chopp neste jogo, marque "Não se aplica".', 40),
  ('antes', 'A&B', 'Gelo, copos, guardanapos e descartáveis repostos', null, 50),
  ('antes', 'Limpeza', 'Limpeza do camarote', null, 110),
  ('antes', 'Limpeza', 'Limpeza dos estofados', null, 120),
  ('antes', 'Limpeza', 'Lixo — estado geral das lixeiras (vazias e com saco)', null, 130),
  ('antes', 'Limpeza', 'Banheiro limpo e abastecido (papel, sabonete)', 'Se o camarote não tiver banheiro próprio, marque "Não se aplica".', 140),
  ('antes', 'LEDs', 'Funcionamento do LED geral', null, 210),
  ('antes', 'LEDs', 'Funcionamento do LED testeira', null, 220),
  ('antes', 'LEDs', 'Funcionamento da tela interativa', null, 230),
  ('antes', 'TVs', 'Funcionamento das TVs', null, 310),
  ('antes', 'TVs', 'Teste de conexão com a internet', null, 320),
  ('antes', 'TVs', 'Teste de transmissão do jogo', 'Conferir no canal/streaming detentor dos direitos da competição.', 330),
  ('antes', 'Estrutura e recepção', 'Ar-condicionado funcionando', null, 410),
  ('antes', 'Estrutura e recepção', 'Mobiliário completo e sem avarias', null, 420),
  ('antes', 'Estrutura e recepção', 'Saídas de emergência desobstruídas e extintor no lugar', null, 430),
  ('antes', 'Estrutura e recepção', 'Lista de convidados aberta no celular / impressa na recepção', null, 440),
  ('depois', 'A&B', 'Contagem final das bebidas (aba Bebidas)', 'Vira a sobra do próximo jogo.', 10),
  ('depois', 'A&B', 'Sobras do buffet registradas/recolhidas', 'Se não houve buffet, marque "Não se aplica".', 20),
  ('depois', 'A&B', 'Choppeira desligada e higienizada', 'Se não houve chopp, marque "Não se aplica".', 30),
  ('depois', 'Limpeza', 'Estado geral do camarote após o jogo', null, 110),
  ('depois', 'Limpeza', 'Avarias em estofados ou mobiliário', 'Se houver avaria, marque "Problema" e descreva (e anexe foto).', 120),
  ('depois', 'Limpeza', 'Itens esquecidos por convidados (achados e perdidos)', 'Descreva e informe onde ficaram guardados.', 130),
  ('depois', 'Equipamentos', 'TVs, LEDs e tela interativa desligados', null, 210),
  ('depois', 'Equipamentos', 'Ar-condicionado e luzes desligados', null, 220),
  ('depois', 'Fechamento', 'Camarote trancado e chaves devolvidas', null, 310);

insert into op_bebidas (nome, unidade, ordem) values
  ('Cerveja (lata 350 ml)', 'latas', 10),
  ('Chopp', 'litros', 20),
  ('Refrigerante (lata)', 'latas', 30),
  ('Refrigerante zero (lata)', 'latas', 40),
  ('Água sem gás', 'garrafas', 50),
  ('Água com gás', 'garrafas', 60),
  ('Suco', 'unidades', 70),
  ('Energético', 'latas', 80);

-- Storage (produção): bucket privado para as fotos. No banco de testes/demo não existe o schema storage.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('operacao', 'operacao', false) on conflict (id) do nothing;
  end if;
end $$;
