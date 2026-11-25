import { beforeAll, describe, expect, it } from "vitest";
import { BancoTeste } from "./helpers";

let b: BancoTeste;
let adm: string, mkt: string, respDH: string, dh: string;

async function novoEvento() {
  const [{ criar_evento }] = await b.como<{ criar_evento: string }>(mkt, `select criar_evento($1)`, [
    JSON.stringify({ tipo: "jogo", titulo: "Galo × Estrangeiros", inicio: "2099-11-02T21:30:00-03:00", status: "aberto" }),
  ]);
  return criar_evento;
}

beforeAll(async () => {
  b = await BancoTeste.criar();
  adm = await b.criarUsuario("Admin Pass", "admin");
  mkt = await b.criarUsuario("Marketing Pass", "marketing");
  respDH = await b.criarUsuario("Resp DH Pass", "responsavel", ["dh"]);
  dh = await b.areaId("dh");
});

describe("passaporte no lugar do CPF (estrangeiro)", () => {
  it("normaliza, valida e mascara no banco", async () => {
    const [r] = await b.sql<{ n: string; v: boolean; m: string; curto: boolean; cpf: string }>(
      `select normalizar_cpf('ab 123-456') n, cpf_valido('ab123456') v, mascarar_cpf('AB123456') m,
              cpf_valido('ab1') curto, normalizar_cpf('529.982.247-25') cpf`);
    expect(r).toEqual({ n: "AB123456", v: true, m: "Pass. AB***56", curto: false, cpf: "52998224725" });
  });

  it("entra como pessoa, barra o mesmo passaporte no jogo e aparece mascarado para o responsável", async () => {
    const ev = await novoEvento();
    const [{ r }] = await b.como<{ r: { ingressos: string[] } }>(
      adm, `select reservar_ingressos($1, 'arquibancada', $2, 2, 'Visitantes') as r`, [ev, dh]);
    const john = { nome: "John Smith", cpf: "ab123456", celular: "31999990001" };
    await b.como(adm, `select preencher_reserva($1, $2)`, [r.ingressos[0], JSON.stringify(john)]);
    const [p] = await b.sql<{ cpf: string }>(`select cpf from pessoas where nome = 'John Smith'`);
    expect(p.cpf).toBe("AB123456");
    await expect(b.como(adm, `select preencher_reserva($1, $2)`,
      [r.ingressos[1], JSON.stringify({ ...john, nome: "John Smith Jr", cpf: "AB-123.456" })])).rejects.toThrow(/CPF_DUPLICADO/);
    await expect(b.como(adm, `select preencher_reserva($1, $2)`,
      [r.ingressos[1], JSON.stringify({ ...john, cpf: "ab1" })])).rejects.toThrow(/CPF_INVALIDO/);
    const lista = await b.como<{ nome: string; cpf: string }>(respDH, `select nome, cpf from lista_area($1, 'arquibancada', $2)`, [ev, dh]);
    expect(lista.find((l) => l.nome === "John Smith")?.cpf).toBe("Pass. AB***56");
  });
});
