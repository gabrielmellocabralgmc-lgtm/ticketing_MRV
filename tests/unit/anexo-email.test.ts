import { describe, expect, it } from "vitest";
import { canalEmail } from "@/lib/mensagens/email";

describe("e-mail com anexo", () => {
  it("manda o PDF como attachment para o Resend", async () => {
    let corpo: Record<string, unknown> = {};
    const fetchFalso = (async (_: string, init: { body: string }) => { corpo = JSON.parse(init.body); return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    const r = await canalEmail({ apiKey: "re_teste", fetch: fetchFalso }).enviar({
      para: { nome: "Gestor", email: "gestor@exemplo.com" }, assunto: "Convocação", texto: "Olá",
      anexos: [{ nome: "Passo a passo.pdf", base64: "JVBERi0=" }],
    });
    expect(r.ok).toBe(true);
    expect(corpo.attachments).toEqual([{ filename: "Passo a passo.pdf", content: "JVBERi0=" }]);
  });
});
