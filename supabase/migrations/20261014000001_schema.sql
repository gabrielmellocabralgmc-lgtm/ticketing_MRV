-- Sistema de Gestão de Ingressos MRV · Arena MRV
-- Schema base: áreas, perfis, eventos, cotas, pessoas, pedidos, ingressos, convites, histórico, auditoria.

-- ---------------------------------------------------------------- enums
create type papel_usuario as enum ('admin', 'marketing', 'responsavel', 'operacao');
create type tipo_evento as enum ('jogo', 'show');
create type status_evento as enum ('rascunho', 'aberto', 'fechado', 'realizado', 'encerrado');
create type setor as enum ('camarote', 'arquibancada', 'pista');
create type origem_pedido as enum ('responsavel', 'convite', 'marketing', 'importacao', 'forms');
create type prioridade_camarote as enum ('exec_presidencia', 'diretor', 'gestor');
create type tipo_catering as enum ('corporativo', 'pessoal');
create type preenchido_por as enum ('responsavel', 'convidado', 'marketing', 'importacao');
create type status_convite as enum ('aguardando', 'preenchido', 'expirado', 'cancelado');
create type status_ingresso as enum (
  'convite_enviado',          -- vaga do Modo B criada, link gerado
  'aguardando_preenchimento', -- convidado abriu o link
  'solicitado',
  'validado_area',
  'aprovado',
  'facial_pendente',          -- passo a passo do Galo ID enviado
  'facial_ok',                -- torcedor confirmou a biometria
  'enviado',                  -- ingresso enviado no sistema do Atlético
  'confirmado',               -- torcedor recebeu/aceitou o ingresso
  'presente',
  'convite_expirado',
  'lista_espera',
  'recusado',
  'cancelado',
  'no_show'
);

-- ---------------------------------------------------------------- cadastros
create table areas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  slug text not null unique,
  ordem int not null default 0,
  centro_custo text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table perfis (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  email text not null unique,
  papel papel_usuario not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table area_responsaveis (
  area_id uuid not null references areas (id) on delete cascade,
  user_id uuid not null references perfis (user_id) on delete cascade,
  primary key (area_id, user_id)
);

create table eventos (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_evento not null default 'jogo',
  titulo text not null,                   -- "Galo × Montevideo"
  adversario text,                        -- jogos
  atracao text,                           -- shows
  competicao text,
  show_proprio boolean,                   -- shows: true = cortesia; false = MRV compra camarote a preço de custo
  inicio timestamptz not null,
  abertura_portoes timestamptz,
  prazo_solicitacao timestamptz,
  prazo_validacao timestamptz,
  concorrido boolean not null default false,
  status status_evento not null default 'rascunho',
  duplicado_de uuid references eventos (id) on delete set null,
  observacoes text,
  criado_por uuid references auth.users (id),
  criado_em timestamptz not null default now()
);

-- Capacidade de cada setor no evento (44 camarote, 100 arquibancada, 50 pista)
create table evento_setores (
  evento_id uuid not null references eventos (id) on delete cascade,
  setor setor not null,
  capacidade int not null check (capacidade >= 0),
  cota_por_area boolean not null default true, -- camarote: false por padrão (fila por prioridade)
  primary key (evento_id, setor)
);

-- Divisão do setor por área
create table cotas (
  evento_id uuid not null,
  setor setor not null,
  area_id uuid not null references areas (id),
  quantidade int not null check (quantidade >= 0),
  sob_demanda boolean not null default false, -- ex.: Rel. Institucional nos shows
  primary key (evento_id, setor, area_id),
  foreign key (evento_id, setor) references evento_setores (evento_id, setor) on delete cascade
);

create table cotas_historico (
  id bigint generated always as identity primary key,
  evento_id uuid not null references eventos (id) on delete cascade,
  setor setor not null,
  area_id uuid references areas (id), -- null = capacidade do setor
  de int,
  para int,
  autor uuid,
  motivo text,
  em timestamptz not null default now()
);

-- Uma pessoa é única por CPF entre eventos (histórico de uso / no-show por pessoa)
create table pessoas (
  id uuid primary key default gen_random_uuid(),
  cpf char(11) unique check (cpf ~ '^\d{11}$'),
  nome text not null,
  email text,
  celular text,
  colaborador_mrv boolean not null default false,
  anonimizada_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table pedidos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos (id) on delete cascade,
  setor setor not null,
  area_id uuid not null references areas (id),
  origem origem_pedido not null,
  solicitante uuid references auth.users (id),   -- usuário que lançou
  titular_ingresso_id uuid,                      -- colaborador/anfitrião (preenchido depois)
  prioridade prioridade_camarote,
  catering tipo_catering,
  centro_custo text,
  indicacao_de text,
  observacao text,
  criado_em timestamptz not null default now()
);

create table convites (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos (id) on delete cascade,
  evento_id uuid not null references eventos (id) on delete cascade,
  setor setor not null,
  area_id uuid not null references areas (id),
  token text not null unique,
  qtd_lugares int not null check (qtd_lugares between 1 and 10),
  nome_previsto text,
  contato text,
  expira_em timestamptz not null,
  status status_convite not null default 'aguardando',
  aberto_em timestamptz,
  preenchido_em timestamptz,
  criado_por uuid references auth.users (id),
  criado_em timestamptz not null default now()
);

-- Um registro por lugar
create table ingressos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos (id) on delete cascade,
  setor setor not null,
  area_id uuid not null references areas (id),
  pedido_id uuid not null references pedidos (id) on delete cascade,
  convite_id uuid references convites (id) on delete set null,
  pessoa_id uuid references pessoas (id),          -- null enquanto aguarda preenchimento
  convidado_de uuid references ingressos (id) on delete set null,
  status status_ingresso not null,
  preenchido_por preenchido_por,
  token text not null unique,                      -- link da página do torcedor
  cpf_duplicado_liberado boolean not null default false,
  lista_espera_desde timestamptz,
  facial_em timestamptz,
  enviado_em timestamptz,
  recebido_em timestamptz,
  checkin_em timestamptz,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table pedidos
  add constraint pedidos_titular_fk foreign key (titular_ingresso_id) references ingressos (id) on delete set null;

-- CPF duplicado no mesmo evento (qualquer setor/área) é barrado, salvo liberação do Marketing
create unique index ingressos_cpf_unico_por_evento on ingressos (evento_id, pessoa_id)
  where pessoa_id is not null
    and not cpf_duplicado_liberado
    and status not in ('convite_expirado', 'recusado', 'cancelado');

create index ingressos_evento_setor_area on ingressos (evento_id, setor, area_id, status);
create index ingressos_pedido on ingressos (pedido_id);

create table validacoes (
  id bigint generated always as identity primary key,
  evento_id uuid not null references eventos (id) on delete cascade,
  setor setor not null,
  area_id uuid not null references areas (id),
  validado_por uuid not null references perfis (user_id),
  qtd int not null,
  em timestamptz not null default now()
);

create table status_historico (
  id bigint generated always as identity primary key,
  ingresso_id uuid not null references ingressos (id) on delete cascade,
  de status_ingresso,
  para status_ingresso not null,
  autor uuid,
  autor_tipo text not null default 'usuario', -- usuario | torcedor | sistema
  motivo text,
  em timestamptz not null default now()
);
create index status_historico_ingresso on status_historico (ingresso_id, em);

create table auditoria (
  id bigint generated always as identity primary key,
  autor uuid,
  acao text not null,          -- ver | exportar | alterar | copiar_cpfs | importar ...
  entidade text not null,
  entidade_id text,
  detalhes jsonb,
  em timestamptz not null default now()
);

create table config (
  chave text primary key,
  valor jsonb not null
);

-- Transições de status permitidas (ordem configurável sem mudar código)
create table transicoes (
  de status_ingresso not null,
  para status_ingresso not null,
  papeis papel_usuario[] not null default '{}',
  torcedor boolean not null default false,
  sistema boolean not null default true,
  primary key (de, para)
);
