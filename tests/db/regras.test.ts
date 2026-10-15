import { beforeAll, describe, expect, it } from "vitest";
import { BancoTeste, pessoa } from "./helpers";

let b: BancoTeste;
let mkt: string, respDH: string, respLuggo: string, oper: string;
let dh: string, luggo: string, presid: string;
let seq = 0;
const nova = (nome?: string) => pessoa(++seq, nome);

async function novoEvento(extra: Record<string, unknown> = {}) {
  const [{ criar_evento }] = await b.como<{ criar_evento: string }>(mkt, `select criar_evento($1)`, [
    JSON.stringify({ tipo: "jogo", titulo: "Galo × Teste", inicio: "2099-11-01T21:30:00-03:00", status: "aberto", ...extra }),
  ]);
  return criar_evento;
}

async function pedir(user: string, ev: string, area: string, pessoas: unknown[], opcoes: object = {}, setor = "arquibancada") {
  const [{ r }] = await b.como<{ r: { pedido_id: string; status: string; ingressos: string[] } }>(
    user, `select criar_pedido($1, $2, $3, $4, $5) as r`, [ev, setor, area, JSON.stringify(pessoas), JSON.stringify(opcoes)]);
  return r;
}

async function saldo(ev: string, area: string, setor = "arquibancada") {
  const [s] = await b.como<{ saldo: number; em_espera: number; cota: number }>(mkt, `select * from saldo($1, $2, $3)`, [ev, setor, area]);
  return s;
}

const statusDe = async (ids: string[]) =>
  (await b.sql<{ status: string }>(`select status from ingressos where id = any($1) order by array_position($1::uuid[], id)`, [ids])).map((r) => r.status);

beforeAll(async () => {
  b = await BancoTeste.criar();
  await b.criarUsuario("Admin", "admin");
  mkt = await b.criarUsuario("Gestora Marketing", "marketing");
  respDH = await b.criarUsuario("Resp DH", "responsavel", ["dh"]);
  respLuggo = await b.criarUsuario("Resp Luggo", "responsavel", ["luggo"]);
  oper = await b.criarUsuario("Operacao", "operacao");
  dh = await b.areaId("dh");
  luggo = await b.areaId("luggo");
  presid = await b.areaId("presidencia");
});

describe("eventos e cotas", () => {
  it("cria jogo com as cotas do regulamento (100 arquibancada, 44 camarote)", async () => {
    const ev = await novoEvento();
    const setores = await b.sql<{ setor: string; capacidade: number; cota_por_area: boolean }>(
      `select setor, capacidade, cota_por_area from evento_setores where evento_id = $1 order by setor`, [ev]);
    expect(setores).toEqual([
      { setor: "camarote", capacidade: 44, cota_por_area: false },
      { setor: "arquibancada", capacidade: 100, cota_por_area: true },
    ]);
    const [{ soma }] = await b.sql<{ soma: number }>(`select sum(quantidade)::int soma from cotas where evento_id = $1`, [ev]);
    expect(soma).toBe(100);
    expect((await saldo(ev, presid)).cota).toBe(18);
  });

  it("show usa pista 50 com Rel. Institucional sob demanda", async () => {
    const ev = await novoEvento({ tipo: "show", titulo: "Show teste" });
    const cotas = await b.sql<{ slug: string; quantidade: number; sob_demanda: boolean }>(
      `select a.slug, c.quantidade, c.sob_demanda from cotas c join areas a on a.id = c.area_id where c.evento_id = $1 and c.setor = 'pista'`, [ev]);
    expect(cotas.reduce((s, c) => s + c.quantidade, 0)).toBe(50);
    expect(cotas.find((c) => c.slug === "rel-institucional")).toMatchObject({ quantidade: 8, sob_demanda: true });
  });

  it("duplicar evento copia cotas ajustadas e registra histórico com motivo", async () => {
    const ev = await novoEvento();
    await b.como(mkt, `select ajustar_cota($1, 'arquibancada', $2, 12, 'reforço DH')`, [ev, dh]);
    const ev2 = await novoEvento({ duplicar_de: ev });
    expect((await saldo(ev2, dh)).cota).toBe(12);
    const hist = await b.sql<{ de: number; para: number; motivo: string }>(
      `select de, para, motivo from cotas_historico where evento_id = $1 and area_id = $2 order by id`, [ev, dh]);
    expect(hist.at(-1)).toMatchObject({ de: 10, para: 12, motivo: "reforço DH" });
  });

  it("responsável não cria evento nem ajusta cota", async () => {
    await expect(b.como(respDH, `select criar_evento('{"titulo":"x","inicio":"2099-01-01"}')`)).rejects.toThrow(/SEM_PERMISSAO/);
    const ev = await novoEvento();
    await expect(b.como(respDH, `select ajustar_cota($1, 'arquibancada', $2, 50, 'quero mais')`, [ev, dh])).rejects.toThrow(/SEM_PERMISSAO/);
  });
});

describe("cota estourando e lista de espera", () => {
  it("bloqueia ou manda para a lista de espera quando a cota da área estoura", async () => {
    const ev = await novoEvento();
    // Luggo tem 6: três pedidos de 2 (colaborador + convidado) enchem a cota
    for (let i = 0; i < 3; i++) await pedir(respLuggo, ev, luggo, [nova(), nova()]);
    expect((await saldo(ev, luggo)).saldo).toBe(0);

    await expect(pedir(respLuggo, ev, luggo, [nova()], { lista_espera: false })).rejects.toThrow(/COTA_EXCEDIDA/);
    const espera = await pedir(respLuggo, ev, luggo, [nova(), nova()]);
    expect(espera.status).toBe("lista_espera");
    expect((await saldo(ev, luggo)).em_espera).toBe(2);
  });

  it("cancelamento libera o lugar e promove o pedido da lista de espera (inteiro)", async () => {
    const ev = await novoEvento();
    const pedidos = [];
    for (let i = 0; i < 3; i++) pedidos.push(await pedir(respLuggo, ev, luggo, [nova(), nova()]));
    const espera = await pedir(respLuggo, ev, luggo, [nova(), nova()]);
    expect(await statusDe(espera.ingressos)).toEqual(["lista_espera", "lista_espera"]);

    // Só 1 lugar livre não basta para o pedido de 2
    await b.como(respLuggo, `select cancelar_ingressos($1, 'convidado não vai')`, [[pedidos[0].ingressos[1]]]);
    expect(await statusDe(espera.ingressos)).toEqual(["lista_espera", "lista_espera"]);

    await b.como(respLuggo, `select cancelar_ingressos($1, 'pedi mas não vou')`, [[pedidos[0].ingressos[0]]]);
    expect(await statusDe(espera.ingressos)).toEqual(["solicitado", "solicitado"]);
    const [h] = await b.sql<{ motivo: string; autor_tipo: string }>(
      `select motivo, autor_tipo from status_historico where ingresso_id = $1 order by id desc limit 1`, [espera.ingressos[0]]);
    expect(h).toEqual({ motivo: "promovido da lista de espera", autor_tipo: "sistema" });
  });

  it("remanejar cota para a área promove a lista de espera", async () => {
    const ev = await novoEvento();
    for (let i = 0; i < 3; i++) await pedir(respLuggo, ev, luggo, [nova(), nova()]);
    const espera = await pedir(respLuggo, ev, luggo, [nova(), nova()]);
    await b.como(mkt, `select remanejar_cota($1, 'arquibancada', $2, $3, 2, 'DH não vai usar')`, [ev, dh, luggo]);
    expect(await statusDe(espera.ingressos)).toEqual(["solicitado", "solicitado"]);
    expect((await saldo(ev, dh)).cota).toBe(8);
  });

  it("não deixa reduzir a cota abaixo do que já está ocupado", async () => {
    const ev = await novoEvento();
    await pedir(respLuggo, ev, luggo, [nova(), nova()]);
    await expect(b.como(mkt, `select ajustar_cota($1, 'arquibancada', $2, 1, 'corte')`, [ev, luggo])).rejects.toThrow(/COTA_ABAIXO_DO_USO/);
  });

  it("capacidade total do setor também limita (camarote sem cota por área)", async () => {
    const ev = await novoEvento();
    await b.como(mkt, `select ajustar_cota($1, 'camarote', null, 3, 'teste')`, [ev]);
    await pedir(mkt, ev, presid, [nova(), nova(), nova()], {}, "camarote");
    const r = await pedir(mkt, ev, dh, [nova()], {}, "camarote");
    expect(r.status).toBe("lista_espera");
  });

  it("fechar o prazo devolve o saldo não usado ao pool", async () => {
    const ev = await novoEvento();
    await pedir(respLuggo, ev, luggo, [nova(), nova()]);
    const [{ fechar_prazo }] = await b.como<{ fechar_prazo: number }>(mkt, `select fechar_prazo($1)`, [ev]);
    expect(fechar_prazo).toBe(98); // arquibancada: 100 - 2 (camarote não tem cota por área)
    expect((await saldo(ev, luggo)).cota).toBe(2);
  });
});

describe("CPF", () => {
  it("normaliza CPF sem zeros à esquerda e rejeita CPF inválido", async () => {
    const ev = await novoEvento();
    const r = await pedir(respDH, ev, dh, [{ nome: "  Taina   Borges Santos ", cpf: "1529297621", celular: "31999990000" }]);
    const [p] = await b.sql<{ cpf: string; nome: string }>(
      `select p.cpf, p.nome from ingressos i join pessoas p on p.id = i.pessoa_id where i.id = $1`, [r.ingressos[0]]);
    expect(p).toEqual({ cpf: "01529297621", nome: "Taina Borges Santos" });
    await expect(pedir(respDH, ev, dh, [{ nome: "X", cpf: "149.834.656-19", celular: "31999990000" }])).rejects.toThrow(/CPF_INVALIDO/);
  });

  it("exige nome, CPF e celular", async () => {
    const ev = await novoEvento();
    await expect(pedir(respDH, ev, dh, [{ nome: "Sem Celular", cpf: nova().cpf }])).rejects.toThrow(/DADOS_INCOMPLETOS/);
  });

  it("barra CPF duplicado no mesmo evento entre áreas e entre setores", async () => {
    const ev = await novoEvento();
    const p = nova("Duplicada");
    await pedir(respDH, ev, dh, [p]);
    await expect(pedir(respLuggo, ev, luggo, [p])).rejects.toThrow(/CPF_DUPLICADO.*DH/);
    await expect(pedir(mkt, ev, presid, [p], {}, "camarote")).rejects.toThrow(/CPF_DUPLICADO/);
    // no mesmo pedido também
    await expect(pedir(respLuggo, ev, luggo, [nova(), { ...p, nome: "Outra grafia" }])).rejects.toThrow(/CPF_DUPLICADO/);
    // Marketing pode liberar a exceção
    const r = await pedir(mkt, ev, presid, [p], { liberar_duplicado: true }, "camarote");
    expect(r.status).toBe("aprovado"); // o que o Marketing lança já entra aprovado
  });

  it("CPF de pedido cancelado pode ser usado de novo", async () => {
    const ev = await novoEvento();
    const p = nova();
    const r = await pedir(respDH, ev, dh, [p]);
    await b.como(respDH, `select cancelar_ingressos($1)`, [r.ingressos]);
    await expect(pedir(respLuggo, ev, luggo, [p])).resolves.toBeTruthy();
  });

  it("mesmo CPF em outro evento é permitido (pessoa única entre eventos)", async () => {
    const p = nova();
    await pedir(respDH, await novoEvento(), dh, [p]);
    await pedir(respDH, await novoEvento(), dh, [p]);
    const [{ n }] = await b.sql<{ n: number }>(`select count(*)::int n from pessoas where cpf = $1`, [p.cpf]);
    expect(n).toBe(1);
  });
});

describe("Modo B — convites", () => {
  it("vaga conta na cota desde a criação; convidado preenche; lugar não usado volta", async () => {
    const ev = await novoEvento();
    const [{ r }] = await b.como<{ r: { token: string; convite_id: string } }>(
      respLuggo, `select criar_convite($1, 'arquibancada', $2, 2, 'João – Comercial') as r`, [ev, luggo]);
    expect((await saldo(ev, luggo)).saldo).toBe(4);

    // abrir o link marca "aguardando preenchimento"
    const [{ info }] = await b.como<{ info: { tipo: string; qtd_lugares: number } }>(null, `select consultar_link($1) info`, [r.token]);
    expect(info).toMatchObject({ tipo: "convite", qtd_lugares: 2 });
    const st = await b.sql<{ status: string }>(`select status from ingressos where convite_id = $1`, [r.convite_id]);
    expect(st.map((s) => s.status)).toEqual(["aguardando_preenchimento", "aguardando_preenchimento"]);

    // sem aceite de privacidade não passa
    await expect(b.como(null, `select preencher_convite($1, $2, false)`, [r.token, JSON.stringify([nova("João")])])).rejects.toThrow(/ACEITE_OBRIGATORIO/);

    const [{ res }] = await b.como<{ res: { ingressos: { token: string }[] } }>(
      null, `select preencher_convite($1, $2, true) res`, [r.token, JSON.stringify([nova("João Silva")])]);
    expect(res.ingressos).toHaveLength(1);
    expect((await saldo(ev, luggo)).saldo).toBe(5); // o 2º lugar não usado voltou

    const lista = await b.como<{ status: string; preenchido_por: string; cpf: string }>(
      respLuggo, `select status, preenchido_por, cpf from lista_area($1, 'arquibancada', $2) where status = 'solicitado'`, [ev, luggo]);
    expect(lista[0]).toMatchObject({ status: "solicitado", preenchido_por: "convidado" });
    expect(lista[0].cpf).toMatch(/^\*\*\*\.\d{3}\.\d{3}-\*\*$/); // responsável vê CPF mascarado

    // link não pode ser reutilizado
    await expect(b.como(null, `select preencher_convite($1, $2, true)`, [r.token, JSON.stringify([nova()])])).rejects.toThrow(/CONVITE_INDISPONIVEL/);
  });

  it("convite com 2 lugares: titular preenche os dois, acompanhante fica vinculado", async () => {
    const ev = await novoEvento();
    const [{ r }] = await b.como<{ r: { token: string } }>(respDH, `select criar_convite($1, 'arquibancada', $2, 2, 'Maria') as r`, [ev, dh]);
    await b.como(null, `select preencher_convite($1, $2, true)`, [r.token, JSON.stringify([nova("Maria"), nova("Acompanhante")])]);
    const lista = await b.como<{ nome: string; convidado_de_nome: string | null }>(
      respDH, `select nome, convidado_de_nome from lista_area($1, 'arquibancada', $2)`, [ev, dh]);
    expect(lista).toEqual([{ nome: "Maria", convidado_de_nome: null }, { nome: "Acompanhante", convidado_de_nome: "Maria" }]);
  });

  it("convite expirado devolve o saldo e puxa a lista de espera", async () => {
    const ev = await novoEvento();
    const [{ r }] = await b.como<{ r: { convite_id: string; token: string } }>(
      respLuggo, `select criar_convite($1, 'arquibancada', $2, 6, 'Time Luggo') as r`, [ev, luggo]);
    const espera = await pedir(respLuggo, ev, luggo, [nova()]);
    expect(espera.status).toBe("lista_espera");
    await b.sql(`update convites set expira_em = now() - interval '1 minute' where id = $1`, [r.convite_id]);
    await expect(b.como(null, `select preencher_convite($1, $2, true)`, [r.token, JSON.stringify([nova()])])).rejects.toThrow(/CONVITE_EXPIRADO/);
    const [{ expirar_convites }] = await b.como<{ expirar_convites: number }>(null, `select expirar_convites()`);
    expect(expirar_convites).toBe(1);
    expect(await statusDe(espera.ingressos)).toEqual(["solicitado"]);
    expect((await saldo(ev, luggo)).saldo).toBe(5);
  });

  it("não cria convite além do saldo", async () => {
    const ev = await novoEvento();
    await expect(b.como(respLuggo, `select criar_convite($1, 'arquibancada', $2, 7, 'muitos')`, [ev, luggo])).rejects.toThrow(/COTA_EXCEDIDA/);
  });

  it("funções públicas não podem ser chamadas por usuários logados", async () => {
    await expect(b.como(respDH, `select expirar_convites()`)).rejects.toThrow(/permission denied/);
    await expect(b.como(respDH, `select consultar_link('x')`)).rejects.toThrow(/permission denied/);
  });
});

describe("pipeline completo e RLS", () => {
  it("solicitado → validado → aprovado → facial → enviado → confirmado", async () => {
    const ev = await novoEvento();
    const r = await pedir(respDH, ev, dh, [nova(), nova()]);

    // Marketing não aprova antes da validação da área
    const [{ aprovar_ingressos: n0 }] = await b.como<{ aprovar_ingressos: number }>(mkt, `select aprovar_ingressos($1)`, [r.ingressos]);
    expect(n0).toBe(0);
    // responsável não aprova
    await b.como(respDH, `select validar_lista($1, 'arquibancada', $2)`, [ev, dh]);
    await expect(b.como(respDH, `select aprovar_ingressos($1)`, [r.ingressos])).rejects.toThrow(/SEM_PERMISSAO/);

    await b.como(mkt, `select aprovar_ingressos($1)`, [r.ingressos]);
    await b.como(mkt, `select marcar_orientacao_enviada($1)`, [r.ingressos]);
    expect(await statusDe(r.ingressos)).toEqual(["facial_pendente", "facial_pendente"]);

    // sem facial, "marcar enviados" ignora; com forçar, envia e registra
    const [tok] = await b.sql<{ token: string }>(`select token from ingressos where id = $1`, [r.ingressos[0]]);
    await b.como(null, `select acao_torcedor($1, 'facial_ok')`, [tok.token]);
    const [{ marcar_enviados }] = await b.como<{ marcar_enviados: number }>(mkt, `select marcar_enviados($1)`, [r.ingressos]);
    expect(marcar_enviados).toBe(1);
    expect(await statusDe(r.ingressos)).toEqual(["enviado", "facial_pendente"]);
    await b.como(mkt, `select marcar_enviados($1, true)`, [[r.ingressos[1]]]);
    const [h] = await b.sql<{ motivo: string }>(`select motivo from status_historico where ingresso_id = $1 order by id desc limit 1`, [r.ingressos[1]]);
    expect(h.motivo).toBe("enviado sem confirmação da facial");

    // envio marcado por engano pode ser desfeito
    await b.como(mkt, `select desfazer_envio($1)`, [[r.ingressos[0]]]);
    const [desfeito] = await b.sql<{ status: string; enviado_em: string | null }>(`select status, enviado_em from ingressos where id = $1`, [r.ingressos[0]]);
    expect(desfeito).toEqual({ status: "facial_ok", enviado_em: null });
    await expect(b.como(respDH, `select desfazer_envio($1)`, [[r.ingressos[0]]])).rejects.toThrow(/SEM_PERMISSAO/);
    await b.como(mkt, `select marcar_enviados($1)`, [[r.ingressos[0]]]);

    await b.como(null, `select acao_torcedor($1, 'recebido')`, [tok.token]);
    expect((await statusDe([r.ingressos[0]]))[0]).toBe("confirmado");

    const hist = await b.sql<{ para: string }>(`select para from status_historico where ingresso_id = $1 order by id`, [r.ingressos[0]]);
    expect(hist.map((x) => x.para)).toEqual(["solicitado", "validado_area", "aprovado", "facial_pendente", "facial_ok", "enviado", "facial_ok", "enviado", "confirmado"]);
  });

  it("responsável só enxerga a própria área; operação não vê dados pessoais", async () => {
    const ev = await novoEvento();
    await pedir(respDH, ev, dh, [nova()]);
    await pedir(respLuggo, ev, luggo, [nova()]);
    const visiveis = await b.como<{ area_id: string }>(respDH, `select area_id from ingressos where evento_id = $1`, [ev]);
    expect(visiveis.every((v) => v.area_id === dh)).toBe(true);
    expect(visiveis.length).toBe(1);
    await expect(b.como(respDH, `select * from lista_area($1, 'arquibancada', $2)`, [ev, luggo])).rejects.toThrow(/SEM_PERMISSAO/);
    await expect(pedir(respDH, ev, luggo, [nova()])).rejects.toThrow(/SEM_PERMISSAO/);
    expect(await b.como(respDH, `select * from pessoas`)).toEqual([]);
    expect(await b.como(oper, `select * from pessoas`)).toEqual([]);
    expect(await b.como(oper, `select * from ingressos`)).toEqual([]);
    expect((await b.como(mkt, `select * from v_ingressos where evento_id = $1`, [ev])).length).toBe(2);
  });

  it("responsável não solicita após o prazo nem em evento fechado; Marketing pode", async () => {
    const ev = await novoEvento({ prazo_solicitacao: "2000-01-01T00:00:00Z" });
    await expect(pedir(respDH, ev, dh, [nova()])).rejects.toThrow(/PRAZO_ENCERRADO/);
    await expect(pedir(mkt, ev, dh, [nova()])).resolves.toBeTruthy();
    const ev2 = await novoEvento({ status: "rascunho" });
    await expect(pedir(respDH, ev2, dh, [nova()])).rejects.toThrow(/EVENTO_FECHADO/);
  });

  it("camarote: só o Marketing lança pedidos e convites", async () => {
    const ev = await novoEvento();
    await expect(pedir(respDH, ev, dh, [nova()], {}, "camarote")).rejects.toThrow(/CAMAROTE_MARKETING/);
    await expect(b.como(respDH, `select criar_convite($1, 'camarote', $2, 1, 'x')`, [ev, dh])).rejects.toThrow(/CAMAROTE_MARKETING/);
    await expect(pedir(mkt, ev, dh, [nova()], {}, "camarote")).resolves.toBeTruthy();
  });

  it("usuário autenticado sem perfil não faz nada", async () => {
    const [u] = await b.sql<{ id: string }>(`insert into auth.users (email) values ('intruso@x.com') returning id`);
    const ev = await novoEvento();
    expect(await b.como(u.id, `select * from eventos`)).toEqual([]);
    await expect(pedir(u.id, ev, dh, [nova()])).rejects.toThrow(/SEM_PERMISSAO/);
  });
});

describe("resumos", () => {
  it("resumo_evento conta por status e respeita a área do responsável", async () => {
    const ev = await novoEvento();
    await pedir(respDH, ev, dh, [nova(), nova()]);
    await b.como(respDH, `select criar_convite($1, 'arquibancada', $2, 1, 'Fulano')`, [ev, dh]);
    await pedir(respLuggo, ev, luggo, [nova()]);
    const visao = await b.como<{ area_id: string; ocupados: number; solicitados: number; convites_aguardando: number; cota: number }>(
      respDH, `select * from resumo_evento($1)`, [ev]);
    expect(visao).toHaveLength(1);
    expect(visao[0]).toMatchObject({ area_id: dh, ocupados: 3, solicitados: 2, convites_aguardando: 1, cota: 10 });
    const tudo = await b.como<{ setor: string }>(mkt, `select * from resumo_evento($1)`, [ev]);
    expect(tudo.filter((r) => r.setor === "arquibancada")).toHaveLength(10);
    const [arq] = await b.como<{ alocado: number; ocupados: number }>(mkt, `select * from resumo_setores($1) where setor = 'arquibancada'`, [ev]);
    expect(arq).toMatchObject({ alocado: 100, ocupados: 4 });
    // totais do setor só para Admin/Marketing
    expect(await b.como(respDH, `select * from resumo_setores($1)`, [ev])).toEqual([]);
    expect(await b.como(oper, `select * from resumo_setores($1)`, [ev])).toEqual([]);
  });
});

describe("configuração de áreas e responsáveis", () => {
  it("Marketing cria área, adiciona vários responsáveis e remove; responsável não configura", async () => {
    const [{ id }] = await b.como<{ id: string }>(mkt, `select salvar_area(null, 'Jurídico', 'juridico', 'CC-77', true) as id`);
    const u1 = (await b.sql<{ id: string }>(`insert into auth.users (email) values ('ana.jur@mrv.com') returning id`))[0].id;
    const u2 = (await b.sql<{ id: string }>(`insert into auth.users (email) values ('beto.jur@mrv.com') returning id`))[0].id;
    await b.como(mkt, `select adicionar_responsavel($1, $2, 'Ana Jurídico', 'ana.jur@mrv.com')`, [id, u1]);
    await b.como(mkt, `select adicionar_responsavel($1, $2, 'Beto Jurídico', 'Beto.Jur@mrv.com')`, [id, u2]);
    // responsável da DH também pode responder pelo Jurídico
    await b.como(mkt, `select adicionar_responsavel($1, $2, 'ignorado', 'x')`, [id, respDH]);
    const lista = await b.como<{ nome: string; email: string }>(mkt, `select nome, email from responsaveis_por_area() where area_id = $1`, [id]);
    expect(lista.map((l) => l.email).sort()).toEqual(["ana.jur@mrv.com", "beto.jur@mrv.com", "resp.dh@teste.mrv"]);

    // os dois novos já enxergam a área
    const ev = await novoEvento();
    await b.como(mkt, `select ajustar_cota($1, 'arquibancada', $2, 4, 'nova área')`, [ev, id]);
    await expect(pedir(u2, ev, id, [nova()])).resolves.toBeTruthy();

    await b.como(mkt, `select remover_responsavel($1, $2)`, [id, u2]);
    await expect(pedir(u2, ev, id, [nova()])).rejects.toThrow(/SEM_PERMISSAO/);
    // perfil de quem já existia não muda
    const [p] = await b.sql<{ nome: string; papel: string }>(`select nome, papel from perfis where user_id = $1`, [respDH]);
    expect(p).toEqual({ nome: "Resp DH", papel: "responsavel" });

    await expect(b.como(respDH, `select salvar_area(null, 'Hack', 'hack', null, true)`)).rejects.toThrow(/SEM_PERMISSAO/);
    await expect(b.como(mkt, `select salvar_area(null, 'Jurídico', 'juridico-2', null, true)`)).rejects.toThrow(/AREA_DUPLICADA/);
  });
});

describe("perfis simplificados", () => {
  it("responsável vê só a própria cota (sem o total do setor)", async () => {
    const ev = await novoEvento();
    await pedir(respLuggo, ev, luggo, [nova(), nova()]);
    const [vResp] = await b.como<Record<string, number | null>>(respDH, `select * from saldo($1, 'arquibancada', $2)`, [ev, dh]);
    expect(vResp).toMatchObject({ capacidade: null, ocupados_setor: null, cota: 10, saldo: 10 });
    const [vMkt] = await b.como<Record<string, number | null>>(mkt, `select * from saldo($1, 'arquibancada', $2)`, [ev, dh]);
    expect(vMkt).toMatchObject({ capacidade: 100, ocupados_setor: 2 });
  });

  it("Marketing lança só com nome + CPF e já entra aprovado; área continua exigindo celular", async () => {
    const ev = await novoEvento();
    const p = nova("Convidada Marketing");
    const r = await pedir(mkt, ev, dh, [{ nome: p.nome, cpf: p.cpf }]);
    expect(r.status).toBe("aprovado");
    await expect(pedir(mkt, ev, dh, [{ nome: "Sem CPF" }])).rejects.toThrow(/DADOS_INCOMPLETOS/);
    await expect(pedir(respDH, ev, dh, [{ nome: "Sem Celular", cpf: nova().cpf }])).rejects.toThrow(/DADOS_INCOMPLETOS/);
  });

  it("operação vê só os aprovados do camarote e marca a chegada sem mexer no status", async () => {
    const ev = await novoEvento();
    const ok = await pedir(mkt, ev, presid, [nova("Anfitrião"), nova("Convidado A")], {}, "camarote");
    const [pend] = (await b.sql<{ id: string }>(`select id from ingressos where pedido_id = $1`, [ok.pedido_id]));
    expect(pend).toBeTruthy();
    // um pedido ainda não aprovado (área lançou na arquibancada) não aparece
    await pedir(respDH, ev, dh, [nova()]);
    const lista = await b.como<{ ingresso_id: string; nome: string; anfitriao: string; cpf_mascarado: string; chegada_em: string | null }>(
      oper, `select * from lista_camarote($1)`, [ev]);
    expect(lista.map((l) => [l.nome, l.anfitriao])).toEqual([["Anfitrião", "Anfitrião"], ["Convidado A", "Anfitrião"]]);
    expect(lista[0].cpf_mascarado).toMatch(/^\*\*\*/);

    const alvo = lista[1].ingresso_id;
    const [{ registrar_chegada: em }] = await b.como<{ registrar_chegada: string }>(oper, `select registrar_chegada($1, true)`, [alvo]);
    expect(em).toBeTruthy();
    const [st] = await b.sql<{ status: string; chegada_em: string }>(`select status, chegada_em from ingressos where id = $1`, [alvo]);
    expect(st.status).toBe("aprovado"); // envio/status intactos
    // confirmar de novo não muda o horário; desfazer limpa
    const [{ registrar_chegada: em2 }] = await b.como<{ registrar_chegada: string }>(oper, `select registrar_chegada($1, true)`, [alvo]);
    expect(String(em2)).toBe(String(em));
    await b.como(oper, `select registrar_chegada($1, false)`, [alvo]);
    expect((await b.sql<{ chegada_em: string | null }>(`select chegada_em from ingressos where id = $1`, [alvo]))[0].chegada_em).toBeNull();

    await expect(b.como(respDH, `select * from lista_camarote($1)`, [ev])).rejects.toThrow(/SEM_PERMISSAO/);
    expect(await b.como(oper, `select * from v_ingressos`)).toEqual([]);
  });
});

describe("imagens do layout", () => {
  it("Marketing/Admin salvam foto e escudo; responsável não; leitura pública só pelo servidor", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64");
    await b.como(mkt, `select salvar_imagem('login', 'image/png', $1)`, [png]);
    const [img] = await b.como<{ mime: string; base64: string }>(null, `select * from ler_imagem('login')`);
    expect(img).toMatchObject({ mime: "image/png", base64: png });
    await expect(b.como(respDH, `select salvar_imagem('login', 'image/png', $1)`, [png])).rejects.toThrow(/SEM_PERMISSAO/);
    await expect(b.como(respDH, `select * from ler_imagem('login')`)).rejects.toThrow(/permission denied/);
    await expect(b.como(mkt, `select salvar_imagem('../x', 'image/png', $1)`, [png])).rejects.toThrow();
    await expect(b.como(mkt, `select salvar_imagem('ok', 'text/html', $1)`, [png])).rejects.toThrow();
    const disp = await b.como<{ chave: string }>(respDH, `select chave from imagens_disponiveis()`);
    expect(disp.map((d) => d.chave)).toContain("login");
  });
});

describe("comunicação", () => {
  it("só o servidor marca o passo a passo como enviado (aprovado → facial pendente)", async () => {
    const ev = await novoEvento();
    const r = await pedir(mkt, ev, dh, [nova()]);
    await expect(b.como(mkt, `select registrar_orientacao($1)`, [r.ingressos])).rejects.toThrow(/permission denied/);
    const [{ registrar_orientacao: n }] = await b.como<{ registrar_orientacao: number }>(null, `select registrar_orientacao($1)`, [r.ingressos]);
    expect(n).toBe(1);
    expect(await statusDe(r.ingressos)).toEqual(["facial_pendente"]);
  });

  it("modelos de e-mail: Marketing edita, responsável não vê", async () => {
    await b.como(mkt, `update modelos_email set assunto = 'Novo assunto' where chave = 'convocacao_area'`);
    const [m] = await b.sql<{ assunto: string }>(`select assunto from modelos_email where chave = 'convocacao_area'`);
    expect(m.assunto).toBe("Novo assunto");
    expect(await b.como(respDH, `select * from modelos_email`)).toEqual([]);
    expect(await b.como(respDH, `select * from envios`)).toEqual([]);
  });
});

describe("Marketing sem aprovação", () => {
  it("convite gerado pelo Marketing: quem preenche entra aprovado", async () => {
    const ev = await novoEvento();
    const mk = await b.areaId("marketing");
    const [{ r }] = await b.como<{ r: { token: string } }>(mkt, `select criar_convite($1, 'arquibancada', $2, 1, 'Convidado do Marketing') as r`, [ev, mk]);
    await b.como(null, `select preencher_convite($1, $2, true)`, [r.token, JSON.stringify([nova("Convidado Mkt")])]);
    const [i] = await b.sql<{ status: string }>(`select i.status from ingressos i join pessoas p on p.id = i.pessoa_id where p.nome = 'Convidado Mkt'`);
    expect(i.status).toBe("aprovado");
    // convite de responsável de área continua precisando de validação
    const [{ r: r2 }] = await b.como<{ r: { token: string } }>(respDH, `select criar_convite($1, 'arquibancada', $2, 1, 'Convidado DH') as r`, [ev, dh]);
    await b.como(null, `select preencher_convite($1, $2, true)`, [r2.token, JSON.stringify([nova("Convidado da Área")])]);
    const [i2] = await b.sql<{ status: string }>(`select i.status from ingressos i join pessoas p on p.id = i.pessoa_id where p.nome = 'Convidado da Área'`);
    expect(i2.status).toBe("solicitado");
  });
});

describe("facial já conhecida", () => {
  it("quem já teve ingresso enviado vai direto para pronto para envio ao ser aprovado", async () => {
    const p = nova("Já Foi Antes");
    const ev1 = await novoEvento();
    const r1 = await pedir(mkt, ev1, dh, [p]);
    await b.como(mkt, `select marcar_enviados($1, true)`, [r1.ingressos]); // enviado (sem facial) no jogo 1
    const ev2 = await novoEvento();
    const r2 = await pedir(respDH, ev2, dh, [p]);
    await b.como(respDH, `select validar_lista($1, 'arquibancada', $2)`, [ev2, dh]);
    await b.como(mkt, `select aprovar_ingressos($1)`, [r2.ingressos]);
    expect(await statusDe(r2.ingressos)).toEqual(["facial_ok"]);
    const hist = await b.sql<{ para: string; motivo: string | null }>(`select para, motivo from status_historico where ingresso_id = $1 order by id`, [r2.ingressos[0]]);
    expect(hist.map((h) => h.para)).toEqual(["solicitado", "validado_area", "aprovado", "facial_ok"]);
    expect(hist.at(-1)!.motivo).toMatch(/facial já cadastrada/);
    // quem nunca foi continua precisando confirmar
    const r3 = await pedir(mkt, ev2, dh, [nova("Primeira Vez")]);
    expect(await statusDe(r3.ingressos)).toEqual(["aprovado"]);
  });
});
