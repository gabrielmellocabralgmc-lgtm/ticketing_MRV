// Banco de teste em memória (PGlite) com a camada que imita o Supabase (src/lib/demo/banco.ts).
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prepararBanco } from "../../src/lib/demo/banco";

export type Papel = "admin" | "marketing" | "responsavel" | "operacao";

export class BancoTeste {
  constructor(public db: PGlite) {}

  static async criar() {
    const db = new PGlite();
    await prepararBanco(db, { raiz: path.resolve(__dirname, "../..") });
    return new BancoTeste(db);
  }

  async rodarSeed() {
    await this.db.exec(readFileSync(path.resolve(__dirname, "../../supabase/seed.sql"), "utf8"));
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

/** Rpc com argumentos nomeados sobre SQL, como o supabase.rpc. */
export function rpcSql(b: BancoTeste, userId: string | null) {
  return async (fn: string, args: Record<string, unknown>) => {
    const nomes = Object.keys(args);
    const valores = nomes.map((k) => {
      const v = args[k];
      return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v)
        : Array.isArray(v) && v.some((x) => typeof x === "object") ? JSON.stringify(v) : v;
    });
    const sql = `select ${fn}(${nomes.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
    const [{ r }] = await b.como<{ r: unknown }>(userId, sql, valores);
    return r;
  };
}
