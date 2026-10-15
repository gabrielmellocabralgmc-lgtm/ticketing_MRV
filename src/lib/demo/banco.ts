// Postgres embutido (PGlite) com uma camada mínima que imita o Supabase: schema auth,
// auth.uid() lendo o JWT e os papéis anon/authenticated/service_role.
// Usado pelos testes do banco e pelo modo demonstração (npm run demo).
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// A camada auth/papéis (a mesma usada no Neon em produção) fica em supabase/shim.sql

// Privilégios padrão que o Supabase dá às tabelas do schema public (a RLS restringe)
export const GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
`;

const arquivosMigracao = (raiz: string) =>
  readdirSync(path.join(raiz, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();

/** Modo demo: aplica num banco já existente as migrações criadas depois dele. */
export async function aplicarMigracoesNovas(db: PGlite, raiz = process.cwd()) {
  await db.exec(`create table if not exists public._demo_migracoes (arquivo text primary key)`);
  const { rows } = await db.query<{ arquivo: string }>(`select arquivo from public._demo_migracoes`);
  const feitas = new Set(rows.map((r) => r.arquivo));
  for (const f of arquivosMigracao(raiz).filter((f) => !feitas.has(f))) {
    console.log(`[demo] aplicando migração ${f}`);
    await db.exec(readFileSync(path.join(raiz, "supabase/migrations", f), "utf8"));
    await db.exec(GRANTS);
    await db.query(`insert into public._demo_migracoes values ($1)`, [f]);
  }
}

/** Aplica a camada Supabase, as migrações e (opcional) o seed num banco vazio. */
export async function prepararBanco(db: PGlite, opcoes: { raiz?: string; seed?: boolean; registrar?: boolean } = {}) {
  const raiz = opcoes.raiz ?? process.cwd();
  const dir = path.join(raiz, "supabase/migrations");
  await db.exec(readFileSync(path.join(raiz, "supabase/shim.sql"), "utf8"));
  for (const f of arquivosMigracao(raiz)) {
    // GRANTS antes da migração de RLS para imitar a ordem do Supabase
    if (f.includes("rls")) await db.exec(GRANTS);
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  await db.exec(GRANTS);
  if (opcoes.seed) await db.exec(readFileSync(path.join(raiz, "supabase/seed.sql"), "utf8"));
  if (opcoes.registrar) {
    await db.exec(`create table if not exists public._demo_migracoes (arquivo text primary key)`);
    for (const f of arquivosMigracao(raiz)) await db.query(`insert into public._demo_migracoes values ($1) on conflict do nothing`, [f]);
  }
}
