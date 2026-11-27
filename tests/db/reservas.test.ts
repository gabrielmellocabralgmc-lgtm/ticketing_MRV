import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { GRANTS } from "../../src/lib/demo/banco";
import { BancoTeste, pessoa } from "./helpers";

let b: BancoTeste;
let adm: string, mkt: string, respDH: string;
let dh: string, presid: string;
let seq = 500;
const nova = (nome?: string) => pessoa(++seq, nome);

async function novoEvento() {
  const [{ criar_evento }] = await b.como<{ criar_evento: string }>(mkt, `select criar_evento($1)`, [
    JSON.stringify({ tipo: "jogo", titulo: "Galo × Reservas", inicio: "2099-11-01T21:30:00-03:00", status: "aberto" }),
  ]);
  return criar_evento;
}

async function reservar(user: string, ev: string, setor: string, area: string, qtd: number, para: string) {
  const [{ r }] = await b.como<{ r: { pedido_id: string; ingressos: string[] } }>(
    user, `select reservar_ingressos($1, $2, $3, $4, $5) as r`, [ev, setor, area, qtd, para]);
  return r;
}

async function saldo(ev: string, area: string, setor = "arquibancada") {
  const [s] = await b.como<{ saldo: number; cota: number; ocupados_setor: number; capacidade: number }>(
    mkt, `select * from saldo($1, $2, $3)`, [ev, setor, area]);
  return s;
}

beforeAll(async () => {
  b = await BancoTeste.criar();
  adm = await b.criarUsuario("Admin Reservas", "admin");
  mkt = await b.criarUsuario("Marketing Reservas", "marketing");
  respDH = await b.criarUsuario("Resp DH Reservas", "responsavel", ["dh"]);
  dh = await b.areaId("dh");
  presid = await b.areaId("presidencia");
});

describe("reservas de ingressos", () => {
  it("arquibancada: a reserva sai da cota da área e aparece como 'reservado para'", async () => {
    const ev = await novoEvento();
    const antes = await saldo(ev, dh);
    const r = await reservar(adm, ev, "arquibancada", dh, 3, "  Fulano   da Silva ");
    expect(r.ingressos).toHaveLength(3);
    expect((await saldo(ev, dh)).saldo).toBe(antes.saldo - 3);
    expect((await saldo(ev, dh)).cota).toBe(antes.cota); // a cota em si não muda
    const linhas = await b.sql<{ status: string; reservado_para: string; pessoa_id: string | null }>(
      `select status, reservado_para, pessoa_id from v_ingressos where pedido_id = $1`, [r.pedido_id]);
    expect(linhas).toEqual(Array(3).fill({ status: "reservado", reservado_para: "Fulano da Silva", pessoa_id: null }));
  });

  it("arquibancada: não reserva além do saldo da área", async () => {
    const ev = await novoEvento();
    const { saldo: livre } = await saldo(ev, dh);
    await expect(reservar(adm, ev, "arquibancada", dh, livre + 1, "Muita gente")).rejects.toThrow(/COTA_EXCEDIDA/);
  });

  it("camarote: sai do pote geral (capacidade), sem cota de área", async () => {
    const ev = await novoEvento();
    const antes = await saldo(ev, presid, "camarote");
    await reservar(mkt, ev, "camarote", presid, 40, "Diretoria");
    const depois = await saldo(ev, presid, "camarote");
    expect(depois.ocupados_setor).toBe(antes.ocupados_setor + 40);
    // restam 4 no camarote (44): 5 não cabe, 4 cabe — em qualquer área
    await expect(reservar(adm, ev, "camarote", dh, 5, "Convidados DH")).rejects.toThrow(/COTA_EXCEDIDA/);
    await reservar(adm, ev, "camarote", dh, 4, "Convidados DH");
  });

  it("só Admin/Marketing reservam; o nome de quem recebe é obrigatório", async () => {
    const ev = await novoEvento();
    await expect(reservar(respDH, ev, "arquibancada", dh, 1, "Alguém")).rejects.toThrow(/SEM_PERMISSAO/);
    await expect(reservar(adm, ev, "arquibancada", dh, 1, "   ")).rejects.toThrow(/DADOS_INCOMPLETOS/);
  });

  it("preencher a reserva: vira aprovado, mantém o lugar e registra o histórico", async () => {
    const ev = await novoEvento();
    const r = await reservar(adm, ev, "arquibancada", dh, 2, "Beltrano");
    const s1 = await saldo(ev, dh);
    const p = nova("Beltrano de Tal");
    const [{ st }] = await b.como<{ st: string }>(adm, `select preencher_reserva($1, $2) as st`, [r.ingressos[0], JSON.stringify(p)]);
    // aprovado; o sistema pode seguir sozinho para "pronto para envio" (facial já conhecida / jogo sem facial)
    expect(["aprovado", "facial_ok"]).toContain(st);
    expect((await saldo(ev, dh)).saldo).toBe(s1.saldo);
    const [i] = await b.sql<{ nome: string; status: string; reservado_para: string }>(
      `select nome, status, reservado_para from v_ingressos where id = $1`, [r.ingressos[0]]);
    expect(i).toEqual({ nome: "Beltrano de Tal", status: st, reservado_para: "Beltrano" });
    const hist = await b.sql<{ de: string | null; para: string }>(
      `select de, para from status_historico where ingresso_id = $1 order by id`, [r.ingressos[0]]);
    expect(hist.slice(0, 2)).toEqual([{ de: null, para: "reservado" }, { de: "reservado", para: "aprovado" }]);
  });

  it("preencher: exige nome e CPF e barra CPF já presente no jogo", async () => {
    const ev = await novoEvento();
    const r = await reservar(adm, ev, "arquibancada", dh, 2, "Dupla");
    const p = nova("Repetido");
    await expect(b.como(adm, `select preencher_reserva($1, $2)`, [r.ingressos[0], JSON.stringify({ nome: "Sem CPF" })]))
      .rejects.toThrow(/DADOS_INCOMPLETOS/);
    await b.como(adm, `select preencher_reserva($1, $2)`, [r.ingressos[0], JSON.stringify(p)]);
    await expect(b.como(adm, `select preencher_reserva($1, $2)`, [r.ingressos[1], JSON.stringify(p)]))
      .rejects.toThrow(/CPF_DUPLICADO/);
    await expect(b.como(adm, `select preencher_reserva($1, $2)`, [r.ingressos[0], JSON.stringify(nova())]))
      .rejects.toThrow(/TRANSICAO_INVALIDA/);
  });

  it("cancelar a reserva devolve o lugar sem aumentar a cota da área", async () => {
    const ev = await novoEvento();
    const antes = await saldo(ev, dh);
    const r = await reservar(adm, ev, "arquibancada", dh, 1, "Cancela");
    await b.como(adm, `select cancelar_ingresso($1, 'desistiu')`, [r.ingressos[0]]);
    const depois = await saldo(ev, dh);
    expect(depois.saldo).toBe(antes.saldo);
    expect(depois.cota).toBe(antes.cota);
  });

  it("reserva não entra na lista de envio nem na lista da porta do camarote", async () => {
    const ev = await novoEvento();
    await reservar(adm, ev, "camarote", presid, 2, "Porta");
    const porta = await b.como<{ ingresso_id: string }>(adm, `select * from lista_camarote($1)`, [ev]);
    expect(porta).toHaveLength(0);
  });
});

describe("camarote: convidado de", () => {
  it("convidados de anfitrião de fora da lista aparecem como convidados dele (lista da área e da porta)", async () => {
    const ev = await novoEvento();
    const convidados = [nova("Convidada Externa Um"), nova("Convidado Externo Dois")];
    await b.como(adm, `select adicionar_em_massa($1, 'camarote', $2, $3, null, 'Credenciado Fulano')`, [ev, presid, JSON.stringify(convidados)]);
    await reservar(adm, ev, "camarote", presid, 1, "Diretor Reservado");

    const area = await b.como<{ nome: string | null; convidado_de_nome: string | null; titular: boolean; reservado_para: string | null; status: string }>(
      adm, `select nome, convidado_de_nome, titular, reservado_para, status::text from lista_area($1, 'camarote', $2)`, [ev, presid]);
    expect(area.filter((l) => l.nome).map((l) => [l.convidado_de_nome, l.titular])).toEqual([
      ["Credenciado Fulano", false], ["Credenciado Fulano", false],
    ]);
    expect(area.find((l) => l.status === "reservado")).toMatchObject({ nome: null, reservado_para: "Diretor Reservado" });

    const porta = await b.como<{ nome: string; anfitriao: string; titular: boolean }>(adm, `select nome, anfitriao, titular from lista_camarote($1)`, [ev]);
    expect(porta.map((l) => [l.anfitriao, l.titular])).toEqual([["Credenciado Fulano", false], ["Credenciado Fulano", false]]);
  });
});

describe("camarote: definir convidado de à mão", () => {
  it("vincula a alguém da lista, a alguém de fora, ou desfaz — pessoa por pessoa", async () => {
    const ev = await novoEvento();
    const host = nova("Anfitriã Manual");
    const g1 = nova("Convidado Manual Um");
    const g2 = nova("Convidado Manual Dois");
    const [{ r }] = await b.como<{ r: { ingressos: string[] } }>(adm,
      `select adicionar_em_massa($1, 'camarote', $2, $3, null, 'Anfitrião do Pedido') as r`, [ev, presid, JSON.stringify([host, g1, g2])]);
    const [iHost, i1, i2] = r.ingressos;
    const nomeDe = async (id: string) => (await b.sql<{ c: string | null }>(`select convidado_de_nome c from v_ingressos where id = $1`, [id]))[0].c;
    // todos vieram como convidados do anfitrião de fora (do pedido)
    expect(await nomeDe(i1)).toBe("Anfitrião do Pedido");

    // a primeira passa a ser anfitriã (sem vínculo), mesmo com o pedido tendo um anfitrião de fora
    await b.como(adm, `select definir_convidado_de($1)`, [iHost]);
    expect(await nomeDe(iHost)).toBeNull();
    // o segundo vira convidado dela (da lista)
    await b.como(adm, `select definir_convidado_de($1, $2)`, [i1, iHost]);
    expect(await nomeDe(i1)).toBe("Anfitriã Manual");
    // o terceiro, de outra pessoa de fora
    await b.como(adm, `select definir_convidado_de($1, null, 'Credenciado Ciclano')`, [i2]);
    expect(await nomeDe(i2)).toBe("Credenciado Ciclano");

    const porta = await b.como<{ nome: string; anfitriao: string; titular: boolean }>(adm,
      `select nome, anfitriao, titular from lista_camarote($1) order by nome`, [ev]);
    expect(porta).toEqual([
      { nome: "Anfitriã Manual", anfitriao: "Anfitriã Manual", titular: true },
      { nome: "Convidado Manual Dois", anfitriao: "Credenciado Ciclano", titular: false },
      { nome: "Convidado Manual Um", anfitriao: "Anfitriã Manual", titular: false },
    ]);

    // regras
    await expect(b.como(adm, `select definir_convidado_de($1, $1)`, [i1])).rejects.toThrow(/VALOR_INVALIDO/);
    await expect(b.como(adm, `select definir_convidado_de($1, $2)`, [iHost, i1])).rejects.toThrow(/VALOR_INVALIDO/);
    await expect(b.como(respDH, `select definir_convidado_de($1)`, [i1])).rejects.toThrow(/SEM_PERMISSAO/);
  });

  it("vários de uma vez: mesmo anfitrião para todos, tudo ou nada", async () => {
    const ev = await novoEvento();
    const ps = [nova("Lote Anfitrião"), nova("Lote A"), nova("Lote B"), nova("Lote C")];
    const [{ r }] = await b.como<{ r: { ingressos: string[] } }>(adm,
      `select adicionar_em_massa($1, 'camarote', $2, $3) as r`, [ev, presid, JSON.stringify(ps)]);
    const [host, a, bb, c] = r.ingressos;
    // o anfitrião no meio da seleção: nada é alterado
    await expect(b.como(adm, `select definir_convidado_de_varios($1, $2)`, [[a, host, bb], host])).rejects.toThrow(/VALOR_INVALIDO/);
    expect((await b.sql<{ n: number }>(`select count(*)::int n from ingressos where id = any($1) and convidado_de is not null`, [[a, bb]]))[0].n).toBe(0);
    const [{ n }] = await b.como<{ n: number }>(adm, `select definir_convidado_de_varios($1, $2) n`, [[a, bb, c], host]);
    expect(n).toBe(3);
    const nomes = await b.sql<{ c: string }>(`select convidado_de_nome c from v_ingressos where id = any($1)`, [[a, bb, c]]);
    expect(nomes.map((x) => x.c)).toEqual(["Lote Anfitrião", "Lote Anfitrião", "Lote Anfitrião"]);
  });
});

describe("migração 048 sobre o estado de produção", () => {
  it("unifica status_ingresso_old (em uso) e status_ingresso (sem uso) num tipo só, com 'reservado'", async () => {
    const raiz = path.resolve(__dirname, "../..");
    const dir = path.join(raiz, "supabase/migrations");
    const db = new PGlite();
    await db.exec(readFileSync(path.join(raiz, "supabase/shim.sql"), "utf8"));
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (f >= "20261125000048") {
        if (f.startsWith("20261125000048")) {
          // reproduz o que ficou em produção depois das tentativas manuais de 15/11
          await db.exec(`
            alter type status_ingresso rename to status_ingresso_old;
            create type status_ingresso as enum ('reservado', 'convite_enviado', 'aguardando_preenchimento', 'solicitado',
              'validado_area', 'aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente',
              'convite_expirado', 'lista_espera', 'recusado', 'cancelado', 'no_show');`);
        }
      }
      if (f.includes("rls")) await db.exec(GRANTS);
      await db.exec(readFileSync(path.join(dir, f), "utf8"));
    }
    const tipos = await db.query<{ coluna: string; tipo: string }>(
      `select table_name || '.' || column_name coluna, udt_name tipo from information_schema.columns
       where table_schema = 'public' and udt_name like 'status_ingresso%' order by 1`);
    expect(new Set(tipos.rows.map((r) => r.tipo))).toEqual(new Set(["status_ingresso"]));
    const { rows } = await db.query<{ n: number }>(`select count(*)::int n from pg_type where typname = 'status_ingresso_old'`);
    expect(rows[0].n).toBe(0);
    const { rows: valores } = await db.query<{ v: string }>(
      `select enumlabel v from pg_enum where enumtypid = 'status_ingresso'::regtype order by enumsortorder limit 2`);
    expect(valores.map((r) => r.v)).toEqual(["reservado", "convite_enviado"]);
    await db.close();
  });
});

describe("preencher reservas em massa", () => {
  const preencher = (user: string, ids: string[], pessoas: unknown[]) =>
    b.como<{ n: number }>(user, `select preencher_reservas($1::uuid[], $2::jsonb) as n`, [ids, JSON.stringify(pessoas)]);

  it("cada pessoa da lista ocupa uma reserva; as que sobram continuam reservadas", async () => {
    const ev = await novoEvento();
    const r = await reservar(mkt, ev, "camarote", presid, 4, "Diretor João");
    const [{ n }] = await preencher(mkt, r.ingressos.slice(0, 3), [nova("Ana Lima"), nova("Bruno Reis"), { nome: "Carla Dias", cpf: nova().cpf }]);
    expect(n).toBe(3);
    const linhas = await b.sql<{ id: string; status: string; nome: string | null }>(
      `select id, status, nome from v_ingressos where pedido_id = $1`, [r.pedido_id]);
    const por = new Map(linhas.map((l) => [l.id, l]));
    expect(r.ingressos.slice(0, 3).map((id) => por.get(id)?.nome)).toEqual(["Ana Lima", "Bruno Reis", "Carla Dias"]);
    expect(r.ingressos.slice(0, 3).every((id) => por.get(id)?.status !== "reservado")).toBe(true);
    expect(por.get(r.ingressos[3])?.status).toBe("reservado");
  });

  it("tudo ou nada: CPF repetido numa linha não preenche nenhuma e diz qual linha", async () => {
    const ev = await novoEvento();
    const r = await reservar(adm, ev, "camarote", presid, 3, "VPs");
    const p = nova("Duda Alves");
    await expect(preencher(adm, r.ingressos, [nova("Edu Matos"), p, { ...p, nome: "Duda Repetida" }]))
      .rejects.toThrow(/Linha 3 \(Duda Repetida\)/);
    const st = await b.sql<{ status: string }>(`select status from ingressos where pedido_id = $1`, [r.pedido_id]);
    expect(st.every((x) => x.status === "reservado")).toBe(true);
  });

  it("só Admin/Marketing; a lista precisa ter uma pessoa por reserva", async () => {
    const ev = await novoEvento();
    const r = await reservar(adm, ev, "arquibancada", dh, 2, "Fulano");
    await expect(preencher(respDH, r.ingressos, [nova(), nova()])).rejects.toThrow(/SEM_PERMISSAO/);
    await expect(preencher(adm, r.ingressos, [nova()])).rejects.toThrow(/VALOR_INVALIDO/);
    await expect(preencher(adm, r.ingressos, [nova(), { nome: "Sem CPF" }])).rejects.toThrow(/DADOS_INCOMPLETOS: Linha 2/);
  });
});
