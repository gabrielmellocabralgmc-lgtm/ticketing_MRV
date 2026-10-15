import { beforeAll, describe, expect, it } from "vitest";
import { BancoTeste, pessoa } from "./helpers";

let b: BancoTeste;
let mkt: string, oper: string, respDH: string;
let dh: string, presid: string, comercial: string;
let seq = 5000;
const nova = (nome?: string) => pessoa(++seq, nome);

async function evento(concorrido: boolean, capacidade = 44) {
  const [{ id }] = await b.como<{ id: string }>(mkt, `select criar_evento($1) as id`, [
    JSON.stringify({ tipo: "jogo", titulo: "Galo × Teste", inicio: "2099-11-01T21:30:00-03:00", status: "aberto", concorrido }),
  ]);
  if (capacidade !== 44) await b.como(mkt, `select ajustar_cota($1, 'camarote', null, $2, 'teste')`, [id, capacidade]);
  return id;
}
async function pedidoCamarote(ev: string, area: string, n: number, prioridade: string, extra: object = {}) {
  const pessoas = Array.from({ length: n }, (_, i) => ({ nome: i === 0 ? `Anfitrião ${prioridade}` : `Convidado ${i}`, cpf: nova().cpf }));
  const [{ r }] = await b.como<{ r: { pedido_id: string; status: string; ingressos: string[] } }>(mkt,
    `select criar_pedido($1, 'camarote', $2, $3, $4) as r`, [ev, area, JSON.stringify(pessoas), JSON.stringify({ origem: "marketing", prioridade, ...extra })]);
  return r;
}
const status = async (pedido: string) =>
  [...new Set((await b.sql<{ status: string }>(`select status from ingressos where pedido_id = $1`, [pedido])).map((x) => x.status))];

beforeAll(async () => {
  b = await BancoTeste.criar();
  mkt = await b.criarUsuario("Mkt", "marketing");
  oper = await b.criarUsuario("Oper", "operacao");
  respDH = await b.criarUsuario("Resp DH", "responsavel", ["dh"]);
  dh = await b.areaId("dh");
  presid = await b.areaId("presidencia");
  comercial = await b.areaId("comercial-corporativo");
});

describe("camarote: fila por prioridade em jogo concorrido", () => {
  it("jogo tranquilo: pedido do Marketing entra aprovado", async () => {
    const ev = await evento(false);
    const r = await pedidoCamarote(ev, dh, 2, "gestor");
    expect(r.status).toBe("aprovado");
  });

  it("jogo concorrido: tudo entra na fila; distribuir respeita prioridade, depois a hora, e pula quem não cabe", async () => {
    const ev = await evento(true, 6);
    const gestor = await pedidoCamarote(ev, dh, 3, "gestor");        // chegou primeiro
    const diretor = await pedidoCamarote(ev, comercial, 4, "diretor");
    const exec = await pedidoCamarote(ev, presid, 2, "exec_presidencia");
    expect([gestor, diretor, exec].map((x) => x.status)).toEqual(["lista_espera", "lista_espera", "lista_espera"]);

    const [{ distribuir_camarote: n }] = await b.como<{ distribuir_camarote: number }>(mkt, `select distribuir_camarote($1)`, [ev]);
    // 6 vagas: Presidência (2) + Diretor (4) = 6; o gestor fica na fila mesmo tendo pedido antes
    expect(n).toBe(6);
    expect(await status(exec.pedido_id)).toEqual(["facial_ok"]);
    expect(await status(diretor.pedido_id)).toEqual(["facial_ok"]);
    expect(await status(gestor.pedido_id)).toEqual(["lista_espera"]);

    // cancelamento não puxa a fila sozinho em jogo concorrido; aprovar o gestor sem vaga falha
    await expect(b.como(mkt, `select aprovar_pedido_fila($1)`, [gestor.pedido_id])).rejects.toThrow(/COTA_EXCEDIDA/);
    await b.como(mkt, `select cancelar_ingressos($1, 'desistiu')`, [diretor.ingressos]);
    expect(await status(gestor.pedido_id)).toEqual(["lista_espera"]);
    await b.como(mkt, `select aprovar_pedido_fila($1)`, [gestor.pedido_id]);
    expect(await status(gestor.pedido_id)).toEqual(["facial_ok"]);
  });

  it("catering corporativo exige centro de custo; alterações entram no histórico", async () => {
    const ev = await evento(false);
    const r = await pedidoCamarote(ev, dh, 1, "diretor");
    await expect(b.como(mkt, `select atualizar_pedido($1, '{"catering":"corporativo"}')`, [r.pedido_id])).rejects.toThrow(/centro de custo/);
    await b.como(mkt, `select atualizar_pedido($1, '{"catering":"corporativo","centro_custo":"CC-9"}')`, [r.pedido_id]);
    const hist = await b.como<{ oque: string }>(mkt, `select * from historico_pedido($1)`, [r.pedido_id]);
    expect(hist[0].oque).toMatch(/Pedido lançado \(marketing, prioridade diretor\)/);
    expect(hist.map((h) => h.oque).join("\n")).toMatch(/aprovado/);
    expect(hist.at(-1)!.oque).toMatch(/CC-9/);
    expect(await b.como(respDH, `select * from historico_pedido($1)`, [r.pedido_id])).toEqual([]);
  });
});

describe("camarote: convites do anfitrião", () => {
  it("link gerado pelo anfitrião: convidados entram aprovados e vinculados a ele", async () => {
    const ev = await evento(false);
    const r = await pedidoCamarote(ev, presid, 1, "exec_presidencia");
    const [{ c }] = await b.como<{ c: { token: string } }>(mkt, `select criar_convite_anfitriao($1, 2) as c`, [r.ingressos[0]]);
    await b.como(null, `select preencher_convite($1, $2, true)`, [c.token, JSON.stringify([nova("Investidor"), nova("Parceira")])]);
    const lista = await b.como<{ nome: string; anfitriao: string; titular: boolean }>(oper, `select nome, anfitriao, titular from lista_camarote($1)`, [ev]);
    expect(lista.map((l) => [l.nome, l.anfitriao, l.titular])).toEqual([
      ["Anfitrião exec_presidencia", "Anfitrião exec_presidencia", true],
      ["Investidor", "Anfitrião exec_presidencia", false],
      ["Parceira", "Anfitrião exec_presidencia", false],
    ]);
  });

  it("não gera link para anfitrião ainda na fila", async () => {
    const ev = await evento(true);
    const r = await pedidoCamarote(ev, dh, 1, "gestor");
    await expect(b.como(mkt, `select criar_convite_anfitriao($1, 2)`, [r.ingressos[0]])).rejects.toThrow(/aprove o pedido/);
  });
});

describe("check-in: entrada não listada e encerramento", () => {
  it("operação registra walk-in; Marketing aprova e ele entra com chegada; encerrar gera presentes e no-show", async () => {
    const ev = await evento(false);
    const r = await pedidoCamarote(ev, presid, 2, "exec_presidencia");
    const [{ id: w }] = await b.como<{ id: string }>(oper, `select registrar_walkin($1, 'Visitante Surpresa', null, $2, null, 'chegou com o anfitrião') as id`, [ev, r.ingressos[0]]);
    await expect(b.como(oper, `select decidir_walkin($1, true)`, [w])).rejects.toThrow(/SEM_PERMISSAO/);
    await b.como(mkt, `select decidir_walkin($1, true)`, [w]);
    const lista = await b.como<{ nome: string; anfitriao: string; chegada_em: string | null; ingresso_id: string }>(oper, `select * from lista_camarote($1)`, [ev]);
    const visitante = lista.find((l) => l.nome === "Visitante Surpresa")!;
    expect(visitante.anfitriao).toBe("Anfitrião exec_presidencia");
    expect(visitante.chegada_em).toBeTruthy();

    // anfitrião chegou; o convidado dele não
    await b.como(oper, `select registrar_chegada($1, true)`, [r.ingressos[0]]);
    const [{ encerrar_evento: res }] = await b.como<{ encerrar_evento: { presentes: number; no_show: number } }>(mkt, `select encerrar_evento($1)`, [ev]);
    expect(res).toEqual({ presentes: 2, no_show: 1 });
    expect(await status(r.pedido_id)).toEqual(expect.arrayContaining(["presente", "no_show"]));
    const [e] = await b.sql<{ status: string }>(`select status from eventos where id = $1`, [ev]);
    expect(e.status).toBe("realizado");
  });

  it("walk-in exige nome e quem recebe; responsável não registra", async () => {
    const ev = await evento(false);
    await expect(b.como(oper, `select registrar_walkin($1, '', null, null, 'X', null)`, [ev])).rejects.toThrow(/nome/);
    await expect(b.como(oper, `select registrar_walkin($1, 'Fulano', null, null, null, null)`, [ev])).rejects.toThrow(/recebendo/);
    await expect(b.como(respDH, `select registrar_walkin($1, 'Fulano', null, null, 'X', null)`, [ev])).rejects.toThrow(/SEM_PERMISSAO/);
  });
});

describe("chegada sem internet", () => {
  it("guarda o horário em que foi confirmada no celular (dentro de um limite razoável)", async () => {
    const ev = await evento(false);
    const r = await pedidoCamarote(ev, dh, 2, "gestor");
    const dezMinAtras = new Date(Date.now() - 10 * 60e3).toISOString();
    const [{ registrar_chegada: em }] = await b.como<{ registrar_chegada: string }>(oper, `select registrar_chegada($1, true, $2)`, [r.ingressos[0], dezMinAtras]);
    expect(Math.abs(new Date(em).getTime() - new Date(dezMinAtras).getTime())).toBeLessThan(1000);
    // horário absurdo (amanhã) vira "agora"
    const amanha = new Date(Date.now() + 24 * 3600e3).toISOString();
    const [{ registrar_chegada: em2 }] = await b.como<{ registrar_chegada: string }>(oper, `select registrar_chegada($1, true, $2)`, [r.ingressos[1], amanha]);
    expect(new Date(em2).getTime()).toBeLessThan(Date.now() + 60e3);
  });
});
