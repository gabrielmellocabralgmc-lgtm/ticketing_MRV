import { describe, expect, it } from "vitest";
import { cpfValido, formatarCpf, mascararCpf, normalizarCpf } from "@/lib/cpf";

describe("cpf", () => {
  it("recupera zeros à esquerda perdidos no Excel", () => {
    expect(normalizarCpf(1529297621)).toBe("01529297621");
    expect(formatarCpf(1529297621)).toBe("015.292.976-21");
    expect(formatarCpf(647664623)).toBe("006.476.646-23");
    expect(cpfValido(1529297621)).toBe(true);
  });

  it("aceita formatos com pontuação, espaços e nbsp", () => {
    expect(normalizarCpf("013.491.836-36 ")).toBe("01349183636");
    expect(normalizarCpf("05617120697 ")).toBe("05617120697");
    expect(cpfValido("149.834.656-18")).toBe(true);
  });

  it("rejeita dígito verificador errado, sequências repetidas e tamanhos inválidos", () => {
    expect(cpfValido("149.834.656-19")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("123")).toBe(false);
    expect(normalizarCpf("123456789012")).toBeNull();
    expect(normalizarCpf("")).toBeNull();
  });

  it("mascara o CPF", () => {
    expect(mascararCpf("123.456.789-09")).toBe("***.456.789-**");
  });
});
