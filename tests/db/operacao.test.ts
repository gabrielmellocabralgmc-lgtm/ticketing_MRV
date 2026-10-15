import { beforeAll, describe, expect, it } from "vitest";
import { BancoTeste } from "./helpers";

let b: BancoTeste;
let adm: string, mkt: string, oper: string;

async function evento(titulo: string, inicio: string) {
  const [{ id }] = await b.como<{ id: string }>(adm, `select criar_evento($1) as id`, [
    JSON.stringify({ tipo: "jogo", titulo, inicio, status: "aberto" }),
  ]);
  return id;
}
const itens = async (momento: string) =>
  b.sql<{ id: string; texto: string }>(`select id, texto from op_itens where momento = $1 and ativo order by ordem`, [momento]);
const bebidas = async () => b.sql<{ id: string; nome: string }>(`select id, nome from op_bebidas where ativo order by ordem`);

beforeAll(async () => {
  b = await BancoTeste.criar();
  adm = await b.criarUsuario("Admin", "admin");
  mkt = await b.criarUsuario("Mkt", "marketing");
  oper = await b.criarUsuario("Oper", "operacao");
});

describe("operação do camarote", () => {
  it("só Operação e Admin acessam", async () => {
    const ev = await evento("Galo × A", "2099-10-01T16:00:00-03:00");
    const [item] = await itens("antes");
    await b.como(oper, `select op_responder($1, $2, 'ok')`, [ev, item.id]);
    await b.como(adm, `select op_responder($1, $2, 'ok')`, [ev, item.id]);
    await expect(b.como(mkt, `select op_responder($1, $2, 'ok')`, [ev, item.id])).rejects.toThrow();
    expect(await b.como(mkt, `select * from op_itens`)).toHaveLength(0); // RLS: Marketing não lê
    expect((await b.como(oper, `select * from op_itens`)).length).toBeGreaterThan(10);
  });

  it("problema exige descrição; concluir exige tudo respondido e a contagem das bebidas; depois trava", async () => {
    const ev = await evento("Galo × B", "2099-10-05T16:00:00-03:00");
    const lista = await itens("antes");
    await expect(b.como(oper, `select op_responder($1, $2, 'problema', '  ')`, [ev, lista[0].id])).rejects.toThrow(/MOTIVO_OBRIGATORIO/);
    await b.como(oper, `select op_responder($1, $2, 'problema', 'TV 2 sem sinal')`, [ev, lista[0].id]);
    await expect(b.como(oper, `select op_concluir($1, 'antes')`, [ev])).rejects.toThrow(/INCOMPLETO: faltam/);
    for (const i of lista.slice(1)) await b.como(oper, `select op_responder($1, $2, 'na')`, [ev, i.id]);
    await expect(b.como(oper, `select op_concluir($1, 'antes')`, [ev])).rejects.toThrow(/bebidas/);
    const bs = await bebidas();
    await b.como(oper, `select op_salvar_bebidas($1, $2)`, [ev, JSON.stringify(bs.map((x) => ({ bebida_id: x.id, contratado: 10, contagem_inicial: 10 })))]);
    await expect(b.como(oper, `select op_concluir($1, 'antes')`, [ev])).rejects.toThrow(/foto das bebidas/);
    await b.como(oper, `select op_registrar_foto($1, 'bebidas_antes', null, $2, 'image/jpeg', 100)`, [ev, `${ev}/beb.jpg`]);
    await b.como(oper, `select op_concluir($1, 'antes')`, [ev]);
    await expect(b.como(oper, `select op_responder($1, $2, 'ok')`, [ev, lista[0].id])).rejects.toThrow(/JA_CONCLUIDO/);
    await b.como(oper, `select op_reabrir($1, 'antes')`, [ev]);
    await b.como(oper, `select op_responder($1, $2, 'ok')`, [ev, lista[0].id]);
  });

  it("a sobra do jogo anterior vem da contagem final dele", async () => {
    const ev1 = await evento("Galo × Anterior", "2099-09-01T16:00:00-03:00");
    const ev2 = await evento("Galo × Seguinte", "2099-09-10T16:00:00-03:00");
    const [cerveja] = await bebidas();
    await b.como(oper, `select op_salvar_bebidas($1, $2)`, [ev1, JSON.stringify([{ bebida_id: cerveja.id, contratado: 48, contagem_inicial: 60, contagem_final: 17 }])]);
    const linhas = await b.como<{ bebida_id: string; sobra_anterior: number; jogo_anterior: string; contratado: number | null }>(oper,
      `select * from op_bebidas_do_jogo($1)`, [ev2]);
    const l = linhas.find((x) => x.bebida_id === cerveja.id)!;
    expect(l).toMatchObject({ sobra_anterior: 17, jogo_anterior: "Galo × Anterior", contratado: null });
    // salvar só o contratado não apaga o que já existia
    await b.como(oper, `select op_salvar_bebidas($1, $2)`, [ev1, JSON.stringify([{ bebida_id: cerveja.id, contratado: 50 }])]);
    const [x] = await b.sql<{ contratado: number; contagem_final: number }>(`select contratado, contagem_final from op_bebidas_jogo where evento_id = $1 and bebida_id = $2`, [ev1, cerveja.id]);
    expect(x).toMatchObject({ contratado: 50, contagem_final: 17 });
  });

  it("relatório só é enviado com os dois check-lists concluídos e depois trava tudo (sem reabrir)", async () => {
    const ev = await evento("Galo × C", "2099-10-08T16:00:00-03:00");
    const [{ r }] = await b.como<{ r: { id: string; enviado_em: string } }>(oper,
      `select op_registrar_foto($1, 'relatorio', null, 'ev/foto.jpg', 'image/jpeg', 1234, 'Camarote pronto') as r`, [ev]);
    expect(r.enviado_em).toBeTruthy();
    await expect(b.como(mkt, `select op_registrar_foto($1, 'relatorio', null, 'ev/x.jpg', 'image/jpeg', 1)`, [ev])).rejects.toThrow();
    await expect(b.como(oper, `select op_salvar_relatorio($1, $2, true)`, [ev, JSON.stringify({ resumo: "Tudo certo" })])).rejects.toThrow(/check-lists/);
    // conclui os dois check-lists
    const bs = await bebidas();
    await b.como(oper, `select op_salvar_bebidas($1, $2)`, [ev, JSON.stringify(bs.map((x) => ({ bebida_id: x.id, contratado: 5, contagem_inicial: 5, contagem_final: 2 })))]);
    for (const m of ["antes", "depois"]) {
      for (const i of await itens(m)) await b.como(oper, `select op_responder($1, $2, 'ok')`, [ev, i.id]);
      await b.como(oper, `select op_registrar_foto($1, $2, null, $3, 'image/jpeg', 100)`, [ev, `bebidas_${m}`, `${ev}/${m}.jpg`]);
      await b.como(oper, `select op_concluir($1, $2)`, [ev, m]);
    }
    await b.como(oper, `select op_salvar_relatorio($1, $2, true)`, [ev, JSON.stringify({ resumo: "Tudo certo", avaliacao: "5", abertura_camarote: "14:00" })]);
    await expect(b.como(oper, `select op_salvar_relatorio($1, $2)`, [ev, JSON.stringify({ resumo: "x" })])).rejects.toThrow(/JA_CONCLUIDO/);
    await expect(b.como(oper, `select op_reabrir($1, 'depois')`, [ev])).rejects.toThrow(/JA_CONCLUIDO/);
    await expect(b.como(oper, `select op_remover_foto($1)`, [r.id])).rejects.toThrow(/JA_CONCLUIDO/);
    await expect(b.como(adm, `select op_reabrir_relatorio($1)`, [ev])).rejects.toThrow(); // não existe mais
  });

  it("contatos do camarote: só o Admin cadastra; Marketing lê", async () => {
    await b.como(adm, `select salvar_contato_camarote(null, 'vp', 'Vice Presidente', 'vp@exemplo.com', 'VP', true)`);
    await expect(b.como(mkt, `select salvar_contato_camarote(null, 'diretoria', 'X', 'x@exemplo.com', null, true)`)).rejects.toThrow();
    expect(await b.como(mkt, `select nome from camarote_contatos`)).toEqual([{ nome: "Vice Presidente" }]);
    expect(await b.como(oper, `select nome from camarote_contatos`)).toEqual([]);
  });
});
