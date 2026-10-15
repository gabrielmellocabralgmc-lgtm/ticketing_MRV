-- Hospedagem fora do Supabase (Neon + Railway):
--  · links de acesso por e-mail (o login por "link mágico" agora é do próprio sistema);
--  · arquivos das fotos da operação guardados no banco (o Neon não tem Storage).
-- As duas tabelas só são acessadas pelo servidor (dono das tabelas): nenhum papel do app lê.

create table acesso_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  destino text not null default '/eventos',
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  usado_em timestamptz
);
create index acesso_links_user on acesso_links (user_id, criado_em desc);
alter table acesso_links enable row level security;
revoke all on acesso_links from anon, authenticated;

create table op_arquivos (
  caminho text primary key,
  mime text not null,
  dados bytea not null check (octet_length(dados) <= 5 * 1024 * 1024),
  criado_em timestamptz not null default now()
);
alter table op_arquivos enable row level security;
revoke all on op_arquivos from anon, authenticated;
