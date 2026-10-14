import { describe, expect, it, vi } from "vitest";
import { canalEmail, REMETENTE_PADRAO } from "@/lib/mensagens/email";

describe("canal de e-mail (Resend)", () => {
  it("envia com o remetente do domínio ingressos.weareact3.com", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    const canal = canalEmail({ apiKey: "re_test", fetch: fetch as unknown as typeof globalThis.fetch });
    const r = await canal.enviar({ para: { nome: "Ana", email: "ana@exemplo.com" }, assunto: "Seu ingresso", texto: "Oi <Ana>\nhttps://x.com/i/abc" });
    expect(r.ok).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init.body));
    expect(body.from).toBe(REMETENTE_PADRAO);
    expect(body.from).toContain("@ingressos.weareact3.com");
    expect(body.to).toEqual(["ana@exemplo.com"]);
    expect(body.html).toContain("&lt;Ana&gt;");
    expect(body.html).toContain('<a href="https://x.com/i/abc"');
  });

  it("não envia sem chave ou sem e-mail", async () => {
    expect((await canalEmail({ apiKey: "" }).enviar({ para: { nome: "A", email: "a@b.com" }, assunto: "", texto: "" })).ok).toBe(false);
    expect((await canalEmail({ apiKey: "k" }).enviar({ para: { nome: "A" }, assunto: "", texto: "" })).ok).toBe(false);
  });
});
