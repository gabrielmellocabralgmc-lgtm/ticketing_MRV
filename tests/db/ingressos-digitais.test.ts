import { beforeAll, describe, expect, it } from "vitest";
import { BancoTeste, pessoa } from "./helpers";

let b: BancoTeste;
let adm: string, mkt: string, respDH: string;
let dh: string;
let seq = 8000;
const nova = (nome?: string) => pessoa(++seq, nome);

async function show() {
  const [{ id }] = await b.como<{ id: string }>(adm, `select criar_evento($1) as id`, [
    JSON.stringify({ tipo: "show", titulo: "Show Teste", atracao: "Show Teste", inicio: "2099-12-01T21:00:00-03:00", status: "aberto" }),
  ]);
  return id;
}
const pedir = async (ev: string, pessoas: unknown[]) => {
  const [{ r }] = await b.como<{ r: { ingressos: string[] } }>(adm, `select criar_pedido($1, 'pista', $2, $3, '{"origem":"marketing","avulsos":true}') as r`,
    [ev, dh, JSON.stringify(pessoas)]);
  return r.ingressos;
};
const dono = async (ingresso: string) =>
  (await b.sql<{ nome_arquivo: string | null; url: string | null }>(`select nome_arquivo, url from ingressos_digitais where ingresso_id = $1`, [ingresso]))[0] ?? null;

beforeAll(async () => {
  b = await BancoTeste.criar();
  adm = await b.criarUsuario("Admin", "admin");
  mkt = await b.criarUsuario("Mkt", "marketing");
  respDH = await b.criarUsuario("Resp DH", "responsavel", ["dh"]);
  dh = await b.areaId("dh");
});

describe("ingressos digitais (shows)", () => {
  it("padrões por tipo: show usa ingresso digital e não exige facial; jogo o contrário", async () => {
    const ev = await show();
    const [{ jogo }] = await b.como<{ jogo: string }>(adm, `select criar_evento($1) as jogo`, [
      JSON.stringify({ tipo: "jogo", titulo: "Galo × Teste", adversario: "Teste", inicio: "2099-12-02T16:00:00-03:00" }),
    ]);
    const linhas = await b.sql<{ id: string; ingressos_digitais: boolean; exige_facial: boolean }>(
      `select id, ingressos_digitais, exige_facial from eventos where id = any($1)`, [[ev, jogo]]);
    expect(linhas.find((l) => l.id === ev)).toMatchObject({ ingressos_digitais: true, exige_facial: false });
    expect(linhas.find((l) => l.id === jogo)).toMatchObject({ ingressos_digitais: false, exige_facial: true });
    await expect(b.como(adm, `select dig_adicionar($1, 'arquibancada', '[{"tipo":"link","url":"https://x.com/1"}]')`, [jogo])).rejects.toThrow(/não usa ingressos digitais/);
  });

  it("distribui nominais (CPF, nome) antes dos genéricos; avisa quem ficou sem; só staff mexe", async () => {
    const ev = await show();
    const ana = nova("Ana Júlia Prado"), beto = nova("Beto Souza"), caio = nova("Caio Lima"), dani = nova("Dani Rocha");
    const [iAna, iBeto, iCaio, iDani] = await pedir(ev, [ana, beto, caio, dani]);
    await b.como(adm, `select dig_adicionar($1, 'pista', $2)`, [ev, JSON.stringify([
      { tipo: "link", url: "https://ingressos.exemplo/generico-1" },
      { tipo: "link", url: "https://ingressos.exemplo/beto", titular_cpf: beto.cpf },
      { tipo: "pdf", caminho: "dig/ana.pdf", nome_arquivo: "ANA JULIA PRADO.pdf", titular_nome: "ana julia prado" },
      { tipo: "link", url: "https://ingressos.exemplo/generico-2" },
    ])]);
    await expect(b.como(respDH, `select dig_atribuir($1)`, [ev])).rejects.toThrow();
    const [{ dig_atribuir: r }] = await b.como<{ dig_atribuir: Record<string, number> }>(mkt, `select dig_atribuir($1)`, [ev]);
    expect(r).toEqual({ por_cpf: 1, por_nome: 1, genericos: 2, sem_ingresso: 0 });
    expect((await dono(iBeto))!.url).toBe("https://ingressos.exemplo/beto");
    expect((await dono(iAna))!.nome_arquivo).toBe("ANA JULIA PRADO.pdf");
    expect((await dono(iCaio))!.url).toMatch(/generico/);
    expect((await dono(iDani))!.url).toMatch(/generico/);

    // mais um convidado sem estoque
    const [iEva] = await pedir(ev, [nova("Eva Nunes")]);
    const [{ dig_atribuir: r2 }] = await b.como<{ dig_atribuir: Record<string, number> }>(adm, `select dig_atribuir($1)`, [ev]);
    expect(r2.sem_ingresso).toBe(1);
    expect(await dono(iEva)).toBeNull();
  });

  it("cancelado antes do envio devolve ao estoque; enviado libera o download pelo token e trava a remoção", async () => {
    const ev = await show();
    const [i1, i2] = await pedir(ev, [nova("Fulano Um"), nova("Ciclano Dois")]);
    await b.como(adm, `select dig_adicionar($1, 'pista', $2)`, [ev, JSON.stringify([
      { tipo: "link", url: "https://ingressos.exemplo/a" }, { tipo: "link", url: "https://ingressos.exemplo/b" }])]);
    await b.como(adm, `select dig_atribuir($1)`, [ev]);
    await b.como(adm, `select cancelar_ingressos($1, 'desistiu')`, [[i2]]);
    expect(await dono(i2)).toBeNull();
    const [{ n }] = await b.sql<{ n: number }>(`select count(*)::int n from ingressos_digitais where evento_id = $1 and ingresso_id is null`, [ev]);
    expect(n).toBe(1);

    const [{ token }] = await b.sql<{ token: string }>(`select token from ingressos where id = $1`, [i1]);
    expect(await b.sql(`select * from dig_do_token($1)`, [token])).toHaveLength(0); // página: só depois de enviado
    expect(await b.sql(`select * from dig_arquivo_do_token($1)`, [token])).toHaveLength(1); // link direto: já vale (envio por fora)
    await b.como(adm, `select dig_marcar_enviados($1)`, [[i1]]);
    const [st] = await b.sql<{ status: string }>(`select status from ingressos where id = $1`, [i1]);
    expect(st.status).toBe("enviado");
    const baixar = await b.sql<{ url: string }>(`select url from dig_do_token($1)`, [token]);
    expect(baixar).toHaveLength(1);
    expect(baixar[0].url).toMatch(/^https:\/\/ingressos\.exemplo\/[ab]$/);
    const [{ id: dig }] = await b.sql<{ id: string }>(`select id from ingressos_digitais where ingresso_id = $1`, [i1]);
    await expect(b.como(adm, `select dig_remover($1)`, [dig])).rejects.toThrow(/JA_ENVIADO/);
  });
});

describe("criação do evento: camarote opcional e cotas personalizadas", () => {
  const setoresDe = async (ev: string) =>
    (await b.sql<{ setor: string; capacidade: number }>(`select setor, capacidade from evento_setores where evento_id = $1 order by setor`, [ev]));
  it("sem camarote: o setor nem existe; cotas personalizadas substituem o padrão", async () => {
    const [{ id }] = await b.como<{ id: string }>(adm, `select criar_evento($1) as id`, [JSON.stringify({
      tipo: "show", titulo: "Show Sem Camarote", atracao: "Show Sem Camarote", inicio: "2099-12-05T21:00:00-03:00",
      tem_camarote: false, cotas: { pista: { capacidade: 30, cota_por_area: true, areas: { dh: 12, luggo: 0 } } },
    })]);
    expect(await setoresDe(id)).toEqual([{ setor: "pista", capacidade: 30 }]);
    const cotas = await b.sql<{ slug: string; quantidade: number }>(`select a.slug, c.quantidade from cotas c join areas a on a.id = c.area_id where c.evento_id = $1 order by a.slug`, [id]);
    expect(cotas).toEqual([{ slug: "dh", quantidade: 12 }, { slug: "luggo", quantidade: 0 }]);
  });

  it("liga e desliga o camarote depois; não desliga com convidado no camarote", async () => {
    const [{ id }] = await b.como<{ id: string }>(adm, `select criar_evento($1) as id`, [JSON.stringify({
      tipo: "jogo", titulo: "Galo × Liga", adversario: "Liga", inicio: "2099-12-06T16:00:00-03:00", tem_camarote: false })]);
    expect((await setoresDe(id)).map((x) => x.setor)).toEqual(["arquibancada"]);
    await b.como(adm, `select definir_camarote($1, true)`, [id]);
    expect(await setoresDe(id)).toContainEqual({ setor: "camarote", capacidade: 44 });
    await b.como(adm, `select criar_pedido($1, 'camarote', $2, $3, '{"origem":"marketing","avulsos":true}')`, [id, dh, JSON.stringify([nova()])]);
    await expect(b.como(adm, `select definir_camarote($1, false)`, [id])).rejects.toThrow(/CAMAROTE_EM_USO/);
    await expect(b.como(respDH, `select definir_camarote($1, true)`, [id])).rejects.toThrow();
  });
});

describe("excluir evento", () => {
  it("só o Admin exclui; leva junto ingressos, ingressos digitais e arquivos", async () => {
    const ev = await show();
    await pedir(ev, [nova("Vai Sumir")]);
    await b.como(adm, `select dig_adicionar($1, 'pista', $2)`, [ev, JSON.stringify([{ tipo: "pdf", caminho: `dig/${ev}/x.pdf`, nome_arquivo: "x.pdf" }])]);
    await b.sql(`insert into op_arquivos (caminho, mime, dados) values ($1, 'application/pdf', '\\x00')`, [`dig/${ev}/x.pdf`]);
    await expect(b.como(mkt, `select excluir_evento($1)`, [ev])).rejects.toThrow();
    await b.como(adm, `select excluir_evento($1)`, [ev]);
    for (const [t, col] of [["eventos", "id"], ["ingressos", "evento_id"], ["ingressos_digitais", "evento_id"]]) {
      const [{ n }] = await b.sql<{ n: number }>(`select count(*)::int n from ${t} where ${col} = $1`, [ev]);
      expect(n).toBe(0);
    }
    const [{ n }] = await b.sql<{ n: number }>(`select count(*)::int n from op_arquivos where caminho like $1`, [`dig/${ev}/%`]);
    expect(n).toBe(0);
  });
});

describe("link de resgate de uso único (Eventim)", () => {
  it("só revela o link pelo resgate; tolera nova tentativa por 30 min; depois trava; equipe libera de novo", async () => {
    const ev = await show();
    await b.sql(`update eventos set resgate_unico = true where id = $1`, [ev]);
    const [i1] = await pedir(ev, [nova("Resgate Um")]);
    await b.como(adm, `select dig_adicionar($1, 'pista', '[{"tipo":"link","url":"https://www.eventim.com.br/transfer/abc123"}]')`, [ev]);
    await b.como(adm, `select dig_atribuir($1)`, [ev]);
    const [{ token }] = await b.sql<{ token: string }>(`select token from ingressos where id = $1`, [i1]);

    // antes de enviado não resgata
    await expect(b.sql(`select dig_resgatar($1)`, [token])).rejects.toThrow(/ainda não foi liberado/);
    await b.como(adm, `select dig_marcar_enviados($1)`, [[i1]]);

    const [{ dig_resgatar: url }] = await b.sql<{ dig_resgatar: string }>(`select dig_resgatar($1)`, [token]);
    expect(url).toBe("https://www.eventim.com.br/transfer/abc123");
    // depois de aberto, não dá mais para cancelar pelo link
    await expect(b.sql(`select acao_torcedor($1, 'cancelar')`, [token])).rejects.toThrow(/SEM_CANCELAMENTO/);
    // segunda tentativa dentro da janela: ok
    await b.sql(`select dig_resgatar($1)`, [token]);
    const [d] = await b.sql<{ id: string; resgate_vezes: number }>(`select id, resgate_vezes from ingressos_digitais where ingresso_id = $1`, [i1]);
    expect(d.resgate_vezes).toBe(2);

    // passou a janela: trava
    await b.sql(`update ingressos_digitais set resgate_aberto_em = now() - interval '31 minutes' where id = $1`, [d.id]);
    await expect(b.sql(`select dig_resgatar($1)`, [token])).rejects.toThrow(/JA_RESGATADO: este ingresso já foi resgatado em/);
    const [estado] = await b.sql<{ travado: boolean }>(`select * from dig_resgate_estado($1)`, [token]);
    expect(estado.travado).toBe(true);

    // só a equipe libera um novo resgate
    await expect(b.como(respDH, `select dig_liberar_resgate($1)`, [d.id])).rejects.toThrow();
    await b.como(mkt, `select dig_liberar_resgate($1)`, [d.id]);
    await b.sql(`select dig_resgatar($1)`, [token]);

    // confirmou que apareceu no app: trava de vez
    await b.sql(`select acao_torcedor($1, 'recebido')`, [token]);
    await expect(b.sql(`select dig_resgatar($1)`, [token])).rejects.toThrow(/JA_RESGATADO/);
  });

  it("evento comum não usa o resgate", async () => {
    const ev = await show();
    const [i1] = await pedir(ev, [nova("Comum Um")]);
    const [{ token }] = await b.sql<{ token: string }>(`select token from ingressos where id = $1`, [i1]);
    await expect(b.sql(`select dig_resgatar($1)`, [token])).rejects.toThrow(/não usa link de resgate/);
  });
});

describe("distribuição em sequência", () => {
  it("links saem na ordem colada (1, 2, 3…) e as áreas recebem em bloco, na ordem das áreas", async () => {
    const ev = await show();
    const luggo = await b.areaId("luggo");
    const [{ ordem_dh, ordem_luggo }] = await b.sql<{ ordem_dh: number; ordem_luggo: number }>(
      `select (select ordem from areas where id = $1) ordem_dh, (select ordem from areas where id = $2) ordem_luggo`, [dh, luggo]);
    const [primeira, segunda] = ordem_dh <= ordem_luggo ? [dh, luggo] : [luggo, dh];
    // pedidos intercalados: segunda área, primeira, segunda, primeira
    const pedirArea = async (area: string, nome: string) => {
      const [{ r }] = await b.como<{ r: { ingressos: string[] } }>(adm, `select criar_pedido($1, 'pista', $2, $3, '{"origem":"marketing","avulsos":true}') as r`,
        [ev, area, JSON.stringify([nova(nome)])]);
      return r.ingressos[0];
    };
    const s1 = await pedirArea(segunda, "Seg Um"), p1 = await pedirArea(primeira, "Pri Um");
    const s2 = await pedirArea(segunda, "Seg Dois"), p2 = await pedirArea(primeira, "Pri Dois");
    const links = Array.from({ length: 12 }, (_, i) => ({ tipo: "link", url: `https://www.eventim.com.br/teste-${i + 1}` }));
    await b.como(adm, `select dig_adicionar($1, 'pista', $2)`, [ev, JSON.stringify(links)]);
    await b.como(adm, `select dig_atribuir($1)`, [ev]);
    const url = async (i: string) => (await dono(i))!.url;
    expect([await url(p1), await url(p2), await url(s1), await url(s2)]).toEqual([
      "https://www.eventim.com.br/teste-1", "https://www.eventim.com.br/teste-2",
      "https://www.eventim.com.br/teste-3", "https://www.eventim.com.br/teste-4",
    ]);
  });
});
