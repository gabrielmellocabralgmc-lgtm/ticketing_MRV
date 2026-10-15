// Prepara o banco de produção (Neon) — roda a cada deploy, antes de subir o app:
//   1. camada auth/papéis (supabase/shim.sql, idempotente);
//   2. migrações de supabase/migrations que ainda não foram aplicadas (cada uma numa transação);
//   3. primeiro Admin, se ADMIN_EMAIL estiver definido e ainda não houver nenhum.
// Uso: node scripts/migrar.mjs   (lê DATABASE_URL_DIRETA ou DATABASE_URL)
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
// Confere as variáveis antes de conectar, com mensagens claras (sem mostrar a senha)
function conferir(nome) {
  const bruto = process.env[nome];
  if (!bruto) return null;
  const v = bruto.trim();
  const problema =
    /COLE_AQUI/i.test(v) ? "ainda está com o texto de exemplo (COLE_AQUI…)"
    : /^["']|["']$/.test(v) ? "está entre aspas — tire as aspas"
    : /^psql\s/i.test(v) ? "começa com 'psql' — cole só a URL postgresql://…"
    : /^\w+=/.test(v) ? "tem um 'NOME=' dentro do valor — cole só a URL"
    : !/^postgres(ql)?:\/\//i.test(v) ? "não começa com postgresql://"
    : null;
  if (problema) {
    console.error(`[migrar] ${nome} inválida: ${problema}. Corrija em Railway → Variables.`);
    process.exit(1);
  }
  try {
    const u = new URL(v);
    console.log(`[migrar] ${nome}: host ${u.hostname}, banco ${u.pathname.slice(1) || "(sem nome!)"}`);
  } catch {
    console.error(`[migrar] ${nome} inválida: não é uma URL. Se a senha tiver caracteres especiais, copie de novo pelo botão Connect do Neon.`);
    process.exit(1);
  }
  return v;
}
const diretaOk = conferir("DATABASE_URL_DIRETA");
const appOk = conferir("DATABASE_URL");
const url = diretaOk || appOk;
if (!url) {
  console.error("[migrar] DATABASE_URL não configurada");
  process.exit(1);
}
const GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
revoke all on acesso_links, op_arquivos from anon, authenticated;
`.trim();
// o último revoke só vale depois que essas tabelas existem
const grants = async (c) => {
  const { rows } = await c.query(`select count(*)::int n from pg_tables where schemaname = 'public' and tablename in ('acesso_links', 'op_arquivos')`);
  await c.query(rows[0].n === 2 ? GRANTS : GRANTS.split("\n").slice(0, 3).join("\n"));
};

const c = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query(readFileSync(path.join(raiz, "supabase/shim.sql"), "utf8"));
  await c.query(`create table if not exists public._migracoes (arquivo text primary key, aplicada_em timestamptz not null default now())`);
  const feitas = new Set((await c.query(`select arquivo from public._migracoes`)).rows.map((r) => r.arquivo));
  const arquivos = readdirSync(path.join(raiz, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
  let n = 0;
  for (const f of arquivos.filter((f) => !feitas.has(f))) {
    console.log(`[migrar] aplicando ${f}`);
    await c.query("begin");
    try {
      // como no Supabase: as tabelas já têm os grants padrão quando a RLS é configurada
      if (f.includes("rls")) await grants(c);
      await c.query(readFileSync(path.join(raiz, "supabase/migrations", f), "utf8"));
      await grants(c);
      await c.query(`insert into public._migracoes (arquivo) values ($1)`, [f]);
      await c.query("commit");
      n++;
    } catch (e) {
      await c.query("rollback");
      throw new Error(`${f}: ${e.message}`);
    }
  }
  console.log(n ? `[migrar] ${n} migração(ões) aplicada(s).` : "[migrar] banco em dia.");

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (email) {
    const { rows } = await c.query(`select 1 from perfis where papel = 'admin' and ativo limit 1`);
    if (!rows.length) {
      const nome = process.env.ADMIN_NOME?.trim() || "Admin";
      const { rows: u } = await c.query(
        `insert into auth.users (email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
         values ($1, $2, now(), now(), now()) on conflict (email) do update set updated_at = now() returning id`,
        [email, JSON.stringify({ nome })]);
      await c.query(
        `insert into perfis (user_id, nome, email, papel, ativo) values ($1, $2, $3, 'admin', true)
         on conflict (user_id) do update set papel = 'admin', ativo = true`, [u[0].id, nome, email]);
      console.log(`[migrar] primeiro Admin criado: ${email}`);
    }
  }
} catch (e) {
  console.error(`[migrar] erro: ${e.message}`);
  process.exitCode = 1;
} finally {
  await c.end();
}
