// Postgres embutido (PGlite) com uma camada mínima que imita o Supabase: schema auth,
// auth.uid() lendo o JWT e os papéis anon/authenticated/service_role.
// Usado pelos testes do banco e pelo modo demonstração (npm run demo).
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const SHIM = `
create schema auth;
create table auth.users (
  instance_id uuid, id uuid primary key default gen_random_uuid(), aud text, role text, email text unique,
  encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz
);
create table auth.identities (
  id uuid primary key, user_id uuid references auth.users (id), provider_id text, identity_data jsonb, provider text,
  last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

// Privilégios padrão que o Supabase dá às tabelas do schema public (a RLS restringe)
export const GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
`;

/** Aplica a camada Supabase, as migrações e (opcional) o seed num banco vazio. */
export async function prepararBanco(db: PGlite, opcoes: { raiz?: string; seed?: boolean } = {}) {
  const raiz = opcoes.raiz ?? process.cwd();
  const dir = path.join(raiz, "supabase/migrations");
  await db.exec(SHIM);
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    // GRANTS antes da migração de RLS para imitar a ordem do Supabase
    if (f.includes("rls")) await db.exec(GRANTS);
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  await db.exec(GRANTS);
  if (opcoes.seed) await db.exec(readFileSync(path.join(raiz, "supabase/seed.sql"), "utf8"));
}
