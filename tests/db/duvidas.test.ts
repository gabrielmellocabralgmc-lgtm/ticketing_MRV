import { describe, expect, it } from "vitest";
import { BancoTeste } from "./helpers";

// As dúvidas são lidas/gravadas só pelo servidor (service role); gestores e convidados não acessam as tabelas.
describe("dúvidas", () => {
  it("tabelas fechadas para os perfis e conversa com contexto e mensagens", async () => {
    const b = await BancoTeste.criar();
    const resp = await b.criarUsuario("Resp DH", "responsavel", ["dh"]);
    const dh = await b.areaId("dh");
    const [{ id: ev }] = await b.sql<{ id: string }>(`insert into eventos (tipo, titulo, inicio, status) values ('show', 'Show Dúvida', now() + interval '10 days', 'aberto') returning id`);
    await b.sql(`insert into duvidas (id, evento_id, area_id, autor_tipo, autor_user, autor_nome, autor_email) values (gen_random_uuid(), $1, $2, 'gestor', $3, 'Resp DH', 'r@exemplo.com')`, [ev, dh, resp]);
    const [{ id }] = await b.sql<{ id: string }>(`select id from duvidas where evento_id = $1`, [ev]);
    await b.sql(`insert into duvida_mensagens (duvida_id, de, texto) values ($1, 'gestor', 'Posso trocar um convidado?'), ($1, 'equipe', 'Pode, até o prazo.')`, [id]);
    const msgs = await b.sql<{ de: string }>(`select de from duvida_mensagens where duvida_id = $1 order by id`, [id]);
    expect(msgs.map((m) => m.de)).toEqual(["gestor", "equipe"]);
    // gestor direto no banco não enxerga nenhuma conversa (sem permissão ou sem linhas pela RLS)
    const visiveis = await b.como(resp, `select * from duvidas`).catch(() => []);
    expect(visiveis).toEqual([]);
    await expect(b.sql(`insert into duvida_mensagens (duvida_id, de, texto) values ($1, 'gestor', '   ')`, [id])).rejects.toThrow();
  });
});
