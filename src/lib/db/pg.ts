import "server-only";
// Produção: Postgres do Neon (ou qualquer Postgres) via DATABASE_URL.
// Use a string COM pooler do Neon (host "-pooler"): cada consulta é uma transação curta,
// então funciona no modo "transaction" do PgBouncer.
import { Pool, types } from "pg";
import type { Executor, Tx } from "./cliente";

// Mesmos formatos que o app recebia do Supabase (PostgREST): números como número, datas como texto
types.setTypeParser(20, (v) => Number(v)); // int8 (count)
types.setTypeParser(1700, (v) => Number(v)); // numeric
types.setTypeParser(1082, (v) => v); // date: "2026-10-17", sem virar Date com fuso

type Global = { __poolPg?: Pool };
const g = globalThis as Global;

export function pool(): Pool {
  if (!g.__poolPg) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    g.__poolPg = new Pool({
      connectionString: url,
      // serverless (Vercel): poucas conexões por instância; o pooler do Neon cuida do resto
      max: Number(process.env.DB_MAX_CONEXOES ?? (process.env.VERCEL ? 3 : 10)),
      idleTimeoutMillis: process.env.VERCEL ? 10_000 : 30_000,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    });
  }
  return g.__poolPg;
}

export const executorPg: Executor = {
  async transacao(fn) {
    const c = await pool().connect();
    try {
      await c.query("begin");
      const r = await fn(c as unknown as Tx);
      await c.query("commit");
      return r;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  },
};
