import { beforeAll, describe, expect, it } from "vitest";
import { BancoTeste, pessoa } from "./helpers";

let b: BancoTeste;
let admin: string, mkt: string, respDH: string;
let dh: string, presid: string;
let seq = 8000;
const nova = (nome?: string) => pessoa(++seq, nome);

async function evento(inicio: string, titulo = "Galo × Passado") {
  const [{ id }] = await b.como<{ id: string }>(mkt, `select criar_evento($1) as id`, [
    JSON.stringify({ tipo: "jogo", titulo, inicio, status: "aberto" }),
  ]);
  return id;
}
async function pedir(ev: string, area: string, pessoas: unknown[], setor = "arquibancada") {
  const [{ r }] = await b.como<{ r: { pedido_id: string; ingressos: string[] } }>(mkt, `select criar_pedido($1, $2, $3, $4, '{"origem":"marketing"}') as r`,
    [ev, setor, area, JSON.stringify(pessoas)]);
  return r;
}

beforeAll(async () => {
  b = await BancoTeste.criar();
  admin = await b.criarUsuario("Admin", "admin");
  mkt = await b.criarUsuario("Mkt", "marketing");
  respDH = await b.criarUsuario("Resp DH", "responsavel", ["dh"]);
  dh = await b.areaId("dh");
  presid = await b.areaId("presidencia");
});

describe("histórico e relatório", () => {
  it("no-show por área e por pessoa, a partir do check-in do camarote", async () => {
    const ev = await evento(new Date(Date.now() - 3 * 24 * 3600e3).toISOString());
    const faltou = nova("Faltou Sempre");
    const cam = await pedir(ev, presid, [nova("Anfitrião Presente"), faltou], "camarote");
    await pedir(ev, dh, [nova("Arquibancada DH")]);
    await b.como(mkt, `select registrar_chegada($1, true)`, [cam.ingressos[0]]).catch(() => {});
    // check-in de evento passado: registra direto (o limite de 12 h é só para o horário vindo do celular)
    await b.sql(`update ingressos set chegada_em = now() where id = $1`, [cam.ingressos[0]]);
    await b.como(mkt, `select encerrar_evento($1)`, [ev]);

    const desde = new Date(Date.now() - 365 * 24 * 3600e3).toISOString();
    const areas = await b.como<{ area: string; presentes: number; no_show: number; usados: number; cota: number }>(mkt, `select * from historico_areas($1)`, [desde]);
    expect(areas.find((a) => a.area === "Presidência")).toMatchObject({ presentes: 1, no_show: 1, usados: 2 });
    expect(areas.find((a) => a.area === "DH")).toMatchObject({ usados: 1, cota: 10 });

    const pessoas = await b.como<{ nome: string; no_show: number; cpf: string }>(mkt, `select * from historico_pessoas($1)`, [desde]);
    expect(pessoas[0]).toMatchObject({ nome: "Faltou Sempre", no_show: 1 });
    expect(pessoas[0].cpf).toMatch(/^\*\*\*/);

    const rel = await b.como<{ setor: string; area: string; presentes: number; no_show: number; cota: number | null }>(mkt, `select * from relatorio_evento($1)`, [ev]);
    expect(rel.find((r) => r.setor === "camarote")).toMatchObject({ area: "Presidência", presentes: 1, no_show: 1 });
    expect(rel.find((r) => r.area === "DH")).toMatchObject({ cota: 10 });

    // responsável não vê nada disso
    expect(await b.como(respDH, `select * from historico_areas($1)`, [desde])).toEqual([]);
    expect(await b.como(respDH, `select * from relatorio_evento($1)`, [ev])).toEqual([]);
  });

  it("dashboard lista os próximos jogos com funil e pendências", async () => {
    const ev = await evento(new Date(Date.now() + 5 * 24 * 3600e3).toISOString(), "Galo × Futuro");
    await pedir(ev, dh, [nova(), nova()]);
    const linhas = await b.como<{ evento: { titulo: string; setores: { setor: string; aprovados: number }[]; pendencias: { areas_sem_pedido: string[]; facial_pendente: number } } }>(
      mkt, `select * from dashboard_eventos()`);
    const d = linhas.map((l) => l.evento).find((e) => e.titulo === "Galo × Futuro")!;
    expect(d.setores.find((s) => s.setor === "arquibancada")!.aprovados).toBe(2);
    expect(d.pendencias.facial_pendente).toBe(2);
    expect(d.pendencias.areas_sem_pedido).toContain("Luggo");
    expect(d.pendencias.areas_sem_pedido).not.toContain("DH");
  });
});

describe("LGPD", () => {
  it("retenção anonimiza quem só tem eventos antigos e mantém as métricas", async () => {
    const antigo = await evento(new Date(Date.now() - 2 * 365 * 24 * 3600e3).toISOString(), "Galo × Antigo");
    const recente = await evento(new Date(Date.now() + 10 * 24 * 3600e3).toISOString(), "Galo × Recente");
    const so = nova("Só Antigo");
    const ambos = nova("Antigo e Recente");
    await pedir(antigo, dh, [so, ambos]);
    await pedir(recente, dh, [ambos]);

    await expect(b.como(mkt, `select anonimizar_por_retencao(12)`)).rejects.toThrow(/SEM_PERMISSAO/);
    const [{ anonimizar_por_retencao: r }] = await b.como<{ anonimizar_por_retencao: { pessoas: number } }>(admin, `select anonimizar_por_retencao(12)`);
    expect(r.pessoas).toBeGreaterThanOrEqual(1);
    const [p1] = await b.sql<{ nome: string; cpf: string | null }>(`select nome, cpf from pessoas where cpf is null and nome = 'Anonimizado' limit 1`);
    expect(p1).toBeTruthy();
    const [p2] = await b.sql<{ nome: string }>(`select nome from pessoas where cpf = $1`, [ambos.cpf]);
    expect(p2.nome).toBe("Antigo e Recente");
    const [{ n }] = await b.sql<{ n: number }>(`select count(*)::int n from ingressos where evento_id = $1`, [antigo]);
    expect(n).toBe(2); // ingressos e métricas continuam
  });

  it("pedido do titular: anonimiza na hora, mas não se tiver ingresso para jogo futuro", async () => {
    const futuro = await evento(new Date(Date.now() + 10 * 24 * 3600e3).toISOString(), "Galo × Próximo");
    const p = nova("Quer Sair");
    const r = await pedir(futuro, dh, [p]);
    await expect(b.como(admin, `select anonimizar_titular($1)`, [p.cpf])).rejects.toThrow(/TEM_INGRESSO_ATIVO/);
    await b.como(mkt, `select cancelar_ingressos($1)`, [r.ingressos]);
    await b.como(admin, `select anonimizar_titular($1)`, [p.cpf]);
    const [x] = await b.sql<{ n: number }>(`select count(*)::int n from pessoas where cpf = $1`, [p.cpf]);
    expect(x.n).toBe(0);
  });
});

describe("histórico com dados importados", () => {
  it("importados não contam como última hora nem como não aceitos", async () => {
    const ev = await evento(new Date(Date.now() - 2 * 24 * 3600e3).toISOString(), "Galo × Importado");
    await b.como(mkt, `select criar_pedido($1, 'arquibancada', $2, $3, '{"origem":"importacao","ignorar_cota":true}')`,
      [ev, dh, JSON.stringify([{ ...nova("Importada"), status: "enviado" }])]);
    const desde = new Date(Date.now() - 30 * 24 * 3600e3).toISOString();
    const [j] = await b.como<{ titulo: string; ultima_hora: number; usados: number }>(mkt, `select * from historico_eventos($1) where titulo = 'Galo × Importado'`, [desde]);
    expect(j).toMatchObject({ ultima_hora: 0, usados: 1 });
    const pessoas = await b.como<{ nome: string }>(mkt, `select * from historico_pessoas($1)`, [desde]);
    expect(pessoas.map((p) => p.nome)).not.toContain("Importada");
  });
});
