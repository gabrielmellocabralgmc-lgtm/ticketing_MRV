import { describe, expect, it } from "vitest";
import { separarLista } from "@/lib/parse-lista";

describe("separarLista", () => {
  it("lê texto de WhatsApp com formatos variados", () => {
    const r = separarLista(`[14/10 10:32] Gestora: segue a lista para o jogo de hoje, por favor confirmar
1. Rômulo Coscarelli - 011.954.626-46 - (31) 99876-5432
2) Maria  Leite; 06719531689; 31 9 8765 4321
- João Silva\t123.456.789-09\t+55 31 98888-7777\tjoao@empresa.com`);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ nome: "Rômulo Coscarelli", cpf: "01195462646", celular: "31998765432", problemas: [] });
    expect(r[1]).toMatchObject({ nome: "Maria Leite", cpf: "06719531689", celular: "31987654321" });
    expect(r[2]).toMatchObject({ nome: "João Silva", cpf: "12345678909", celular: "31988887777", email: "joao@empresa.com" });
  });

  it("aponta o que falta e CPF inválido", () => {
    const [a, b] = separarLista("Fulano de Tal\nBeltrano 111.222.333-44");
    expect(a.problemas).toEqual(["sem CPF", "sem celular"]);
    expect(b.problemas).toContain("CPF inválido");
  });
});

describe("separarLista — CPF × celular", () => {
  it("não confunde celular sem formatação com CPF", () => {
    const [p] = separarLista("Fulano 31999998888 12345678909");
    expect(p).toMatchObject({ cpf: "12345678909", celular: "31999998888", problemas: [] });
  });
});
