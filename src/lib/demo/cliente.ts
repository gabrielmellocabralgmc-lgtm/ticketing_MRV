// MODO DEMONSTRAÇÃO (npm run demo): o mesmo cliente de produção sobre um Postgres embutido
// (PGlite) gravado em .demo.nosync/. Sem Docker, sem conta, sem e-mail. A RLS e as funções do
// banco são as mesmas de produção. Nunca usar em produção.
import { PGlite } from "@electric-sql/pglite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { criarCliente, type Executor } from "@/lib/db/cliente";
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

const executorDemo: Executor = {
  async transacao(fn) {
    const db = await bancoDemo();
    return db.transaction((tx) => fn(tx));
  },
};

export function clienteDemo(uid: string | null, aoSair?: () => Promise<void>) {
  // no PGlite somos superusuário: o "serviço" usa o papel service_role, como no Supabase
  return criarCliente(executorDemo, uid, { papelServico: "service_role", aoSair });
}
