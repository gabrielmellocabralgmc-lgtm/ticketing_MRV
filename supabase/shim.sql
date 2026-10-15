-- Camada mínima que imita o Supabase num Postgres comum (Neon, demo PGlite, testes):
-- schema auth com usuários, auth.uid() lendo o usuário da transação e os papéis
-- anon/authenticated/service_role usados pela RLS e pelos grants das migrações.
-- Idempotente: pode rodar de novo sem erro.
create schema if not exists auth;
create table if not exists auth.users (
  instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz
);
create table if not exists auth.identities (
  id uuid primary key, user_id uuid references auth.users (id), provider_id text, identity_data jsonb, provider text,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    begin
      create role service_role nologin bypassrls;
    exception when insufficient_privilege then
      -- provedores gerenciados (ex.: Neon) não deixam criar BYPASSRLS: o app usa o dono das tabelas
      create role service_role nologin;
    end;
  end if;
  -- o usuário da conexão precisa poder "virar" esses papéis (set local role) dentro das transações.
  -- No Postgres 16+ (Neon) quem cria um papel só ganha ADMIN sobre ele, não o direito de SET.
  if current_setting('server_version_num')::int >= 160000 then
    if not pg_has_role(current_user, 'authenticated', 'SET') then
      execute format('grant anon, authenticated, service_role to %I with set true', current_user);
    end if;
  elsif not pg_has_role(current_user, 'authenticated', 'MEMBER') then
    execute format('grant anon, authenticated, service_role to %I', current_user);
  end if;
end $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
