import { describe, expect, it } from "vitest";
import { lerLinks, lerNominal } from "../../src/app/(app)/eventos/[id]/ingressos-digitais/ler-nominal";

describe("ingressos nominais: nome/CPF no nome do arquivo ou na linha", () => {
  it("arquivos", () => {
    expect(lerNominal("Maria Souza - 123.456.789-09.pdf")).toEqual({ nome: "Maria Souza", cpf: "12345678909" });
    expect(lerNominal("12345678909_Maria Souza.pdf")).toEqual({ nome: "Maria Souza", cpf: "12345678909" });
    expect(lerNominal("João da Silva.pdf")).toEqual({ nome: "João da Silva", cpf: null });
    expect(lerNominal("12345678909.pdf")).toEqual({ nome: null, cpf: "12345678909" });
    expect(lerNominal("01 - Ana Paula.PDF")).toEqual({ nome: "Ana Paula", cpf: null });
  });
  it("links colados", () => {
    expect(lerLinks("https://t.com/a\n\nMaria Souza; 123.456.789-09; https://t.com/b", true)).toEqual([
      { linha: "https://t.com/a", url: "https://t.com/a", titular_nome: null, titular_cpf: null },
      { linha: "Maria Souza; 123.456.789-09; https://t.com/b", url: "https://t.com/b", titular_nome: "Maria Souza", titular_cpf: "12345678909" },
    ]);
    expect(lerLinks("Maria; https://t.com/c", false)[0]).toMatchObject({ url: "https://t.com/c", titular_nome: null, titular_cpf: null });
    expect(lerLinks("sem link aqui", true)[0].url).toBeNull();
  });
});
