// Importa uma planilha legada (MRV_TicketManagement_*.xlsx) para o banco.
//
//   npm run importar -- arquivo.xlsx --inicio 2026-10-14T21:30:00-03:00 --como admin@mrv.com.br [--dry-run]
//
// Conecta direto no Postgres (DATABASE_URL) e age como o usuário de --como (precisa ser admin ou
// marketing), passando pelas mesmas funções e regras da interface. Com --dry-run tudo roda numa
// transação desfeita no final: serve para ver o relatório de inconsistências sem gravar nada.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Client } from "pg";
import { lerPlanilha } from "../src/lib/importacao/planilha";
import { aplicarPlano } from "../src/lib/importacao/aplicar";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    inicio: { type: "string" },
    como: { type: "string" },
    status: { type: "string" },
    competicao: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

async function main() {
  const arquivo = positionals[0];
  if (!arquivo || !values.como) {
    console.error("Uso: npm run importar -- arquivo.xlsx --como email@admin [--inicio ISO] [--dry-run]");
    process.exit(1);
  }
  const plano = await lerPlanilha(readFileSync(arquivo));
  const ano = new Date().getFullYear();
  const inicio = values.inicio
    ?? (plano.dia && plano.mes ? `${ano}-${String(plano.mes).padStart(2, "0")}-${String(plano.dia).padStart(2, "0")}T21:30:00-03:00` : null);
  if (!inicio) throw new Error("Não consegui ler a data do título; informe --inicio");
  if (!values.inicio) console.warn(`⚠ Horário não informado: usando ${inicio}`);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows: [u] } = await db.query(`select user_id from perfis where email = $1 and papel in ('admin','marketing') and ativo`, [values.como]);
    if (!u) throw new Error(`${values.como} não é admin/marketing ativo`);
    const { rows: areasRows } = await db.query(`select slug, id from areas`);
    const areas = Object.fromEntries(areasRows.map((a) => [a.slug, a.id]));

    await db.query("begin");
    await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`,
      [u.user_id, JSON.stringify({ sub: u.user_id, role: "authenticated" })]);
    await db.query("set local role authenticated");

    let n = 0;
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      const nomes = Object.keys(args);
      const vals = nomes.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
      // savepoint por chamada: um pedido com erro não derruba a importação inteira
      const sp = `sp${++n}`;
      await db.query(`savepoint ${sp}`);
      try {
        const { rows } = await db.query(`select ${fn}(${nomes.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, vals);
        await db.query(`release savepoint ${sp}`);
        return rows[0].r;
      } catch (e) {
        await db.query(`rollback to savepoint ${sp}`);
        throw e;
      }
    };
    const r = await aplicarPlano(plano, rpc, {
      inicio, areas, competicao: values.competicao,
      status: values.status as "aberto" | undefined,
    });
    await db.query(values["dry-run"] ? "rollback" : "commit");

    const avisos = [...plano.avisos, ...r.avisos];
    const mascarar = (s: string) => s.replace(/\b(\d{3})(\d{3})(\d{3})(\d{2})\b/g, "***.$2.$3-**");
    console.log(`\n${plano.titulo} — ${inicio}`);
    console.log(`Ingressos: ${r.ingressosCriados} · vagas reservadas (convites): ${r.vagasCriadas}`);
    console.log("Resumo:", plano.resumo);
    for (const tipo of ["erro", "alerta", "info"] as const) {
      const lista = avisos.filter((a) => a.tipo === tipo);
      if (!lista.length) continue;
      console.log(`\n${tipo.toUpperCase()} (${lista.length})`);
      for (const a of lista) console.log(`  ${a.linha ? `[${a.linha}] ` : ""}${mascarar(a.mensagem)}`);
    }
    console.log(values["dry-run"] ? "\n(dry-run: nada foi gravado)" : `\nGravado. Evento ${r.eventoId}`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
