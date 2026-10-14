// Banco de teste em memória (PGlite) com uma camada mínima que imita o Supabase:
// schema auth, auth.uid() lendo o JWT e os papéis anon/authenticated/service_role.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SHIM = `
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

const GRANTS = `
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
`;

export type Papel = "admin" | "marketing" | "responsavel" | "operacao";

export class BancoTeste {
  constructor(public db: PGlite) {}

  static async criar() {
    const db = new PGlite();
    await db.exec(SHIM);
    const dir = path.resolve(__dirname, "../../supabase/migrations");
    const arquivos = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of arquivos) {
      // GRANTS antes da migração de RLS para imitar os privilégios padrão do Supabase
      if (f.includes("rls")) await db.exec(GRANTS);
      await db.exec(readFileSync(path.join(dir, f), "utf8"));
    }
    await db.exec(GRANTS);
    return new BancoTeste(db);
  }

  /** Executa como superusuário (setup). */
  async sql<T = Record<string, unknown>>(query: string, params: unknown[] = []) {
    await this.db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
    return (await this.db.query<T>(query, params)).rows;
  }

  /** Executa como usuário autenticado (RLS ativa), dentro de uma transação, como numa chamada PostgREST. */
  async como<T = Record<string, unknown>>(userId: string | null, query: string, params: unknown[] = []) {
    const role = userId ? "authenticated" : "service_role";
    return this.db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
      await tx.exec(`set local role ${role}`);
      return (await tx.query<T>(query, params)).rows;
    });
  }

  async criarUsuario(nome: string, papel: Papel, areaSlugs: string[] = []) {
    const email = `${nome.toLowerCase().replace(/\W+/g, ".")}@teste.mrv`;
    const [u] = await this.sql<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email]);
    await this.sql(`insert into perfis (user_id, nome, email, papel) values ($1, $2, $3, $4)`, [u.id, nome, email, papel]);
    for (const slug of areaSlugs) {
      await this.sql(`insert into area_responsaveis (area_id, user_id) select id, $1 from areas where slug = $2`, [u.id, slug]);
    }
    return u.id;
  }

  async areaId(slug: string) {
    const [a] = await this.sql<{ id: string }>(`select id from areas where slug = $1`, [slug]);
    return a.id;
  }
}

/** Gera CPFs válidos e distintos para os testes. */
export function cpfFake(seq: number): string {
  const base = String(100000000 + seq * 7919).slice(0, 9).padStart(9, "0").split("").map(Number);
  for (const n of [9, 10]) {
    let s = 0;
    for (let i = 0; i < n; i++) s += base[i] * (n + 1 - i);
    base.push(((s * 10) % 11) % 10);
  }
  return base.join("");
}

export function pessoa(seq: number, nome = `Pessoa ${seq}`) {
  return { nome, cpf: cpfFake(seq), celular: `319${String(90000000 + seq).slice(-8)}` };
}
