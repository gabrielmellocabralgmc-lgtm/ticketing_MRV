import { describe, expect, it } from "vitest";
import { separarLista } from "@/lib/parse-lista";

describe("colar lista com e-mail", () => {
  it("separa nome, CPF, celular e e-mail em formatos comuns", () => {
    const l = separarLista("Maria Souza; 529.982.247-25; (31) 99999-0000; Maria@Email.com\nJoão Lima\t52998224725\tjoao.lima@empresa.com.br\t31988887777");
    expect(l.map((x) => [x.nome, x.cpf, x.email])).toEqual([
      ["Maria Souza", "52998224725", "maria@email.com"],
      ["João Lima", "52998224725", "joao.lima@empresa.com.br"],
    ]);
    expect(l[0].celular).toMatch(/31999990000/);
  });
});
