import { describe, expect, it } from "vitest";
import { htmlEmail, preencher } from "@/lib/mensagens/modelos";

describe("modelos de e-mail", () => {
  it("troca variáveis e marca as ausentes", () => {
    expect(preencher("Olá, {{responsavel}}! Cota da {{ area }}: {{cota}}. {{inexistente}}", { responsavel: "Ana", area: "DH", cota: 10 }))
      .toBe("Olá, Ana! Cota da DH: 10. —");
  });

  it("gera HTML escapado, com links clicáveis e parágrafos", () => {
    const html = htmlEmail("Oi <b>João</b>\nlinha 2\n\nAcesse https://x.com/i/abc", { botao: { rotulo: "Abrir", url: "https://x.com/i/abc" } });
    expect(html).toContain("Oi &lt;b&gt;João&lt;/b&gt;<br>linha 2");
    expect(html).toContain('<a href="https://x.com/i/abc"');
    expect(html).toContain(">Abrir</a>");
    expect(html).not.toContain("<b>João</b>");
  });
});
