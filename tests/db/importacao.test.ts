import { existsSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { lerPlanilha } from "@/lib/importacao/planilha";
import { aplicarPlano } from "@/lib/importacao/aplicar";
import { exportarEvento, type LinhaExport } from "@/lib/xlsx/exportar";
import { gerarPlanilhaLegada } from "../fixtures/planilha-legada";
import { BancoTeste, rpcSql } from "./helpers";

let b: BancoTeste;
let admin: string;
let areas: Record<string, string>;

beforeAll(async () => {
  b = await BancoTeste.criar();
  admin = await b.criarUsuario("Admin Import", "admin");
  areas = Object.fromEntries((await b.sql<{ slug: string; id: string }>(`select slug, id from areas`)).map((a) => [a.slug, a.id]));
});

describe("leitura da planilha legada", () => {
  it("normaliza CPFs, status, áreas e aponta inconsistências", async () => {
    const plano = await lerPlanilha(await gerarPlanilhaLegada());
    expect(plano).toMatchObject({ titulo: "Galo × Teste FC", adversario: "Teste FC", dia: 5, mes: 11, camaroteDisponibilizados: 44 });

    const ana = plano.pedidos.find((p) => p.pessoas[0].nome === "Ana Teste")!;
    expect(ana.areaSlug).toBe("comercial-corporativo");
    expect(ana.pessoas).toHaveLength(2);
    expect(ana.pessoas[1].nome).toBe("Convidado de Ana Teste");
    expect(ana.pessoas.map((p) => p.cpf!.length)).toEqual([11, 11]);

    const diego = plano.pedidos.find((p) => p.pessoas[0].nome === "Diego Teste")!;
    expect(diego.pessoas.map((p) => p.status)).toEqual(["enviado", "facial_pendente"]);

    const gil = plano.pedidos.find((p) => p.pessoas[0].nome === "Gil Teste")!;
    expect(gil).toMatchObject({ areaSlug: "rel-institucional", indicacaoDe: "Rafinha" });

    const msgs = plano.avisos.map((a) => a.mensagem).join("\n");
    expect(msgs).toMatch(/Bruno Sem Forms.*não preencheu/);
    expect(msgs).toMatch(/CPF inválido para CPF Ruim/);
    expect(msgs).toMatch(/5 reservados × 6 enviados/);
    expect(msgs).toMatch(/CPF de Duplicado Teste repetido/);
    expect(msgs).toMatch(/Fora da Lista.*não aparece na aba Camarote/);
    expect(plano.convidadosCamarote.find((c) => c.nome === "Helena Teste")?.encontrado).toBe(true);

    expect(plano.vagas).toEqual([expect.objectContaining({ nomePrevisto: "PRESIDENCIA", qtd: 2, areaSlug: "presidencia" })]);
    expect(plano.pedidos.filter((p) => p.setor === "camarote").map((p) => [p.indicacaoDe, p.pessoas.length])).toEqual([
      ["PRESIDENCIA", 1], ["Lafetá", 2], ["Rafinha", 1],
    ]);
  });

  it("importa no banco respeitando a regra de CPF duplicado", async () => {
    const plano = await lerPlanilha(await gerarPlanilhaLegada());
    const r = await aplicarPlano(plano, rpcSql(b, admin), { inicio: "2099-11-05T21:30:00-03:00", areas });
    // a linha "Duplicado Teste" repete o CPF da Ana → barrada pelo banco
    expect(r.avisos.some((a) => /CPF_DUPLICADO/.test(a.mensagem))).toBe(true);
    expect(r.vagasCriadas).toBe(2);
    const porStatus = await b.sql<{ setor: string; status: string; n: number }>(
      `select setor, status, count(*)::int n from ingressos where evento_id = $1 group by 1, 2 order by 1, 2`, [r.eventoId]);
    expect(porStatus).toEqual([
      { setor: "camarote", status: "convite_enviado", n: 2 },
      { setor: "camarote", status: "enviado", n: 4 },
      { setor: "arquibancada", status: "aprovado", n: 1 },
      { setor: "arquibancada", status: "facial_pendente", n: 1 },
      { setor: "arquibancada", status: "enviado", n: 8 },
    ]);
    const [cap] = await b.sql<{ capacidade: number }>(`select capacidade from evento_setores where evento_id = $1 and setor = 'camarote'`, [r.eventoId]);
    expect(cap.capacidade).toBe(44);
  });
});

describe("exportação no layout legado", () => {
  it("ida e volta: exportar e ler de novo mantém contagens, CPFs e cota do camarote", async () => {
    const plano = await lerPlanilha(await gerarPlanilhaLegada());
    const r = await aplicarPlano(plano, rpcSql(b, admin), { inicio: "2099-12-05T21:30:00-03:00", areas });
    const linhas = await b.como<LinhaExport>(admin, `select * from v_ingressos where evento_id = $1 order by area_ordem, pedido_id, criado_em`, [r.eventoId]);
    const setores = await b.sql<{ setor: "camarote" | "arquibancada"; capacidade: number }>(`select setor, capacidade from evento_setores where evento_id = $1`, [r.eventoId]);
    const xlsx = await exportarEvento({ titulo: "Galo × Teste FC", dataCurta: "05.12", linhas, setores });
    const volta = await lerPlanilha(xlsx);

    expect(volta.titulo).toBe("Galo × Teste FC");
    expect(volta.camaroteDisponibilizados).toBe(44);
    const cpfs = (p: typeof plano) => p.pedidos.flatMap((x) => x.pessoas.map((y) => y.cpf)).filter(Boolean).sort();
    expect(cpfs(volta)).toEqual(cpfs(plano).filter((c, i, a) => a.indexOf(c) === i)); // sem a linha duplicada barrada
    expect(volta.vagas.reduce((n, v) => n + v.qtd, 0)).toBe(2);
    expect(volta.avisos.filter((a) => a.tipo === "erro")).toEqual([]);
  });
});

// Opcional: valida a planilha real sem gravá-la no repositório (PLANILHA_MRV=/caminho/arquivo.xlsx npm test)
const real = process.env.PLANILHA_MRV;
describe.skipIf(!real || !existsSync(real))("planilha real", () => {
  it("importa sem erros", async () => {
    const plano = await lerPlanilha(readFileSync(real!));
    expect(plano.avisos.filter((a) => a.tipo === "erro")).toEqual([]);
    const r = await aplicarPlano(plano, rpcSql(b, admin), { inicio: "2099-10-14T21:30:00-03:00", areas });
    expect(r.avisos.filter((a) => a.tipo === "erro")).toEqual([]);
    console.log({ ingressos: r.ingressosCriados, vagas: r.vagasCriadas, resumo: plano.resumo });
  });
});
