// MODO DEMONSTRAÇÃO (npm run demo): imita a parte do cliente Supabase que o app usa
// (from/select/eq/in/lt/order/limit/single, insert/update/upsert/delete, rpc, auth) sobre um
// Postgres embutido (PGlite) gravado em .demo.nosync/. Sem Docker, sem conta, sem e-mail.
// A RLS e as funções do banco são as mesmas de produção: cada consulta roda com o papel
// "authenticated" e o usuário escolhido na tela de login. Nunca usar em produção.
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { aplicarMigracoesNovas, prepararBanco } from "./banco";

if (process.env.VERCEL || (process.env.NODE_ENV === "production" && !process.env.DEMO_PERMITIR_PRODUCAO)) {
  throw new Error("O modo demonstração não pode rodar em produção.");
}

type Global = { __bancoDemo?: Promise<PGlite> };
const g = globalThis as Global;

/** Banco único por processo (sobrevive ao hot reload do next dev). */
export function bancoDemo(): Promise<PGlite> {
  if (!g.__bancoDemo) {
    g.__bancoDemo = (async () => {
      // ".nosync": o iCloud não sincroniza (a pasta Desktop está no iCloud e corromperia o banco)
      const dir = path.join(process.cwd(), ".demo.nosync");
      const novo = !existsSync(path.join(dir, "PG_VERSION"));
      mkdirSync(dir, { recursive: true });
      const db = new PGlite(dir);
      if (novo) {
        console.log("[demo] criando banco de demonstração em .demo.nosync/ (migrações + seed)…");
        await prepararBanco(db, { seed: true, registrar: true });
        console.log("[demo] pronto.");
      } else {
        await aplicarMigracoesNovas(db);
      }
      return db;
    })();
  }
  return g.__bancoDemo;
}

type Erro = { message: string; code?: string };
type Resposta<T = unknown> = { data: T | null; error: Erro | null };

const id = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Datas viram ISO (como no PostgREST); objetos de parâmetro viram JSON. */
function normalizar(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return Number(v);
  if (Array.isArray(v)) return v.map(normalizar);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalizar(x)]));
  return v;
}
const param = (v: unknown) =>
  v !== null && typeof v === "object" && !(v instanceof Date) && !(Array.isArray(v) && v.every((x) => typeof x !== "object")) ? JSON.stringify(v) : v;

async function comoUsuario<T>(uid: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const db = await bancoDemo();
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
    await tx.exec(`set local role ${uid ? "authenticated" : "service_role"}`);
    return fn(tx);
  });
}

// ------------------------------------------------------------------ metadados (FKs, PKs, funções)
const cacheFk = new Map<string, { col: string; ref: string; refcol: string }[]>();
async function fks(tx: Transaction, tabela: string) {
  if (!cacheFk.has(tabela)) {
    const { rows } = await tx.query<{ col: string; ref: string; refcol: string }>(`
      select a.attname as col, cl2.relname as ref, a2.attname as refcol
      from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_class cl2 on cl2.oid = c.confrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute a2 on a2.attrelid = c.confrelid and a2.attnum = c.confkey[1]
      where c.contype = 'f' and cl.relname = $1`, [tabela]);
    cacheFk.set(tabela, rows);
  }
  return cacheFk.get(tabela)!;
}

const cachePk = new Map<string, string[]>();
async function pk(tx: Transaction, tabela: string) {
  if (!cachePk.has(tabela)) {
    const { rows } = await tx.query<{ col: string }>(`
      select a.attname as col from pg_index i join pg_class c on c.oid = i.indrelid
      join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
      where c.relname = $1 and i.indisprimary`, [tabela]);
    cachePk.set(tabela, rows.map((r) => r.col));
  }
  return cachePk.get(tabela)!;
}

const cacheFn = new Map<string, { retset: boolean; tipo: string }>();
async function funcao(tx: Transaction, nome: string) {
  if (!cacheFn.has(nome)) {
    const { rows } = await tx.query<{ retset: boolean; tipo: string }>(
      `select p.proretset as retset, t.typname as tipo from pg_proc p join pg_type t on t.oid = p.prorettype
       join pg_namespace n on n.oid = p.pronamespace where p.proname = $1 and n.nspname = 'public' limit 1`, [nome]);
    if (!rows[0]) throw new Error(`função ${nome} não existe`);
    cacheFn.set(nome, rows[0]);
  }
  return cacheFn.get(nome)!;
}

// ------------------------------------------------------------------ select com embeds (PostgREST)
interface Embed { alias: string; dica: string; colunas: string }
function separarTopo(s: string) {
  const out: string[] = [];
  let nivel = 0, atual = "";
  for (const c of s) {
    if (c === "(") nivel++;
    if (c === ")") nivel--;
    if (c === "," && nivel === 0) { out.push(atual.trim()); atual = ""; } else atual += c;
  }
  if (atual.trim()) out.push(atual.trim());
  return out;
}
function lerSelect(s: string) {
  const simples: string[] = [];
  const embeds: Embed[] = [];
  for (const item of separarTopo(s || "*")) {
    const m = item.match(/^(?:(\w+):)?(\w+)\((.*)\)$/s);
    if (m) embeds.push({ alias: m[1] ?? m[2], dica: m[2], colunas: m[3] });
    else simples.push(item);
  }
  return { simples, embeds };
}

type Filtro = { col: string; op: "=" | "<>" | "in" | "<" | ">" | ">=" | "<="; valor: unknown };

class Consulta implements PromiseLike<Resposta> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private colunas = "*";
  private filtros: Filtro[] = [];
  private ordens: { col: string; asc: boolean }[] = [];
  private limite?: number;
  private unico?: "single" | "maybe";
  private dados?: Record<string, unknown> | Record<string, unknown>[];

  constructor(private tabela: string, private uid: string | null) {}

  select(c = "*") { if (this.op === "select") this.colunas = c; return this; }
  insert(d: Record<string, unknown> | Record<string, unknown>[]) { this.op = "insert"; this.dados = d; return this; }
  upsert(d: Record<string, unknown> | Record<string, unknown>[]) { this.op = "upsert"; this.dados = d; return this; }
  update(d: Record<string, unknown>) { this.op = "update"; this.dados = d; return this; }
  delete() { this.op = "delete"; return this; }
  eq(col: string, valor: unknown) { this.filtros.push({ col, op: "=", valor }); return this; }
  in(col: string, valor: unknown[]) { this.filtros.push({ col, op: "in", valor }); return this; }
  lt(col: string, valor: unknown) { this.filtros.push({ col, op: "<", valor }); return this; }
  neq(col: string, valor: unknown) { this.filtros.push({ col, op: "<>", valor }); return this; }
  gt(col: string, valor: unknown) { this.filtros.push({ col, op: ">", valor }); return this; }
  gte(col: string, valor: unknown) { this.filtros.push({ col, op: ">=", valor }); return this; }
  lte(col: string, valor: unknown) { this.filtros.push({ col, op: "<=", valor }); return this; }
  order(col: string, o: { ascending?: boolean } = {}) { this.ordens.push({ col, asc: o.ascending !== false }); return this; }
  limit(n: number) { this.limite = n; return this; }
  single() { this.unico = "single"; return this; }
  maybeSingle() { this.unico = "maybe"; return this; }

  then<A = Resposta, B = never>(ok?: ((v: Resposta) => A | PromiseLike<A>) | null, falha?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return this.executar().then(ok, falha);
  }

  private where(params: unknown[]) {
    if (!this.filtros.length) return "";
    return " where " + this.filtros.map((f) => {
      if (f.op === "in") {
        // literal de array em texto: funciona para enum, uuid e texto
        const itens = (f.valor as unknown[]).map((v) => `"${String(v).replace(/["\\]/g, (c) => `\\${c}`)}"`);
        params.push(`{${itens.join(",")}}`);
        return `${id(f.col)}::text = any($${params.length}::text[])`;
      }
      params.push(f.valor);
      return `${id(f.col)} ${f.op} $${params.length}`;
    }).join(" and ");
  }

  private async executar(): Promise<Resposta> {
    try {
      const data = await comoUsuario(this.uid, (tx) => this.rodar(tx));
      return { data: normalizar(data), error: null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  }

  private async rodar(tx: Transaction): Promise<unknown> {
    const t = id(this.tabela);
    const params: unknown[] = [];
    if (this.op === "select") {
      const { simples, embeds } = lerSelect(this.colunas);
      const relacoes = await fks(tx, this.tabela);
      const resolvidas = embeds.map((e) => {
        const r = relacoes.find((x) => x.col === e.dica) ?? relacoes.find((x) => x.ref === e.dica);
        if (!r) throw new Error(`relação ${this.tabela} → ${e.dica} não encontrada`);
        return { ...e, ...r };
      });
      const extras = resolvidas.map((r) => r.col).filter((c) => !simples.includes(c) && !simples.includes("*"));
      const cols = [...(simples.length ? simples : extras.length ? [] : ["*"]), ...extras].map((c) => (c === "*" ? "*" : id(c))).join(", ");
      let sql = `select ${cols || "*"} from ${t}${this.where(params)}`;
      if (this.ordens.length) sql += " order by " + this.ordens.map((o) => `${id(o.col)} ${o.asc ? "asc" : "desc"}`).join(", ");
      if (this.limite) sql += ` limit ${Number(this.limite)}`;
      const linhas = (await tx.query<Record<string, unknown>>(sql, params)).rows;
      for (const r of resolvidas) {
        const chaves = [...new Set(linhas.map((l) => l[r.col]).filter((v) => v != null))];
        const sub = lerSelect(r.colunas).simples.map((c) => (c === "*" ? "*" : id(c)));
        const alvo = chaves.length
          ? (await tx.query<Record<string, unknown>>(`select ${[...sub, `${id(r.refcol)} as "__chave"`].join(", ")} from ${id(r.ref)} where ${id(r.refcol)} = any($1)`, [chaves])).rows
          : [];
        const porChave = new Map(alvo.map((a) => { const { __chave, ...resto } = a; return [String(__chave), resto]; }));
        for (const l of linhas) l[r.alias] = l[r.col] == null ? null : porChave.get(String(l[r.col])) ?? null;
        if (extras.includes(r.col)) for (const l of linhas) delete l[r.col];
      }
      if (this.unico) {
        if (linhas.length > 1 || (this.unico === "single" && !linhas.length)) throw new Error("JSON object requested, multiple (or no) rows returned");
        return linhas[0] ?? null;
      }
      return linhas;
    }

    if (this.op === "delete") {
      await tx.query(`delete from ${t}${this.where(params)}`, params);
      return null;
    }

    if (this.op === "update") {
      const d = this.dados as Record<string, unknown>;
      const sets = Object.keys(d).map((k) => { params.push(param(d[k])); return `${id(k)} = $${params.length}`; });
      await tx.query(`update ${t} set ${sets.join(", ")}${this.where(params)}`, params);
      return null;
    }

    // insert / upsert
    const linhas = Array.isArray(this.dados) ? this.dados : [this.dados!];
    const chavePk = this.op === "upsert" ? await pk(tx, this.tabela) : [];
    for (const d of linhas) {
      const ks = Object.keys(d);
      const vals = ks.map((k) => param(d[k]));
      let sql = `insert into ${t} (${ks.map(id).join(", ")}) values (${ks.map((_, i) => `$${i + 1}`).join(", ")})`;
      if (this.op === "upsert") {
        const atualiza = ks.filter((k) => !chavePk.includes(k));
        sql += ` on conflict (${chavePk.map(id).join(", ")}) ` + (atualiza.length ? `do update set ${atualiza.map((k) => `${id(k)} = excluded.${id(k)}`).join(", ")}` : "do nothing");
      }
      await tx.query(sql, vals);
    }
    return null;
  }
}

// ------------------------------------------------------------------ cliente
export function clienteDemo(uid: string | null, aoSair?: () => Promise<void>) {
  return {
    from: (tabela: string) => new Consulta(tabela, uid),

    async rpc(fn: string, args: Record<string, unknown> = {}): Promise<Resposta> {
      try {
        const data = await comoUsuario(uid, async (tx) => {
          const f = await funcao(tx, fn);
          const nomes = Object.keys(args);
          const chamada = `${id(fn)}(${nomes.map((k, i) => `${id(k)} => $${i + 1}`).join(", ")})`;
          const vals = nomes.map((k) => param(args[k]));
          if (f.retset) return (await tx.query(`select * from ${chamada}`, vals)).rows;
          const { rows } = await tx.query<{ r: unknown }>(`select ${chamada} as r`, vals);
          return f.tipo === "void" ? null : rows[0]?.r ?? null;
        });
        return { data: normalizar(data), error: null };
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
      }
    },

    auth: {
      async getUser() {
        if (!uid) return { data: { user: null }, error: null };
        const db = await bancoDemo();
        const { rows } = await db.query<{ id: string; email: string }>(`select id, email from auth.users where id = $1`, [uid]);
        return { data: { user: rows[0] ?? null }, error: null };
      },
      async signOut() {
        await aoSair?.();
        return { error: null };
      },
      async signInWithOtp() {
        return { data: null, error: { message: "Modo demonstração: escolha o usuário na tela de login." } };
      },
      async exchangeCodeForSession() {
        return { data: null, error: { message: "modo demonstração" } };
      },
      async verifyOtp() {
        return { data: null, error: { message: "modo demonstração" } };
      },
      admin: {
        async createUser({ email, user_metadata }: { email: string; user_metadata?: Record<string, unknown> }) {
          const db = await bancoDemo();
          const { rows } = await db.query<{ id: string; email: string }>(
            `insert into auth.users (email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
             values ($1, $2, now(), now(), now()) on conflict (email) do nothing returning id, email`,
            [email.toLowerCase(), JSON.stringify(user_metadata ?? {})]);
          return rows[0] ? { data: { user: rows[0] }, error: null } : { data: { user: null }, error: { message: "User already registered" } };
        },
        async listUsers() {
          const db = await bancoDemo();
          const { rows } = await db.query<{ id: string; email: string }>(`select id, email from auth.users`);
          return { data: { users: rows }, error: null };
        },
      },
    },

    // Realtime não existe no modo demo: as telas atualizam ao navegar/agir
    channel() {
      const canal = { on: () => canal, subscribe: () => canal };
      return canal;
    },
    removeChannel() {},
  };
}
