import { describe, expect, it } from "vitest";
import { rotuloSetor, rotuloSetorCurto } from "@/lib/tipos";

describe("nome do setor por evento", () => {
  it("usa o nome personalizado e cai no padrão quando vazio", () => {
    expect(rotuloSetor("pista", { pista: "Cadeira Inferior" })).toBe("Cadeira Inferior");
    expect(rotuloSetor("pista", { pista: "  " })).toBe("Pista");
    expect(rotuloSetor("arquibancada", null)).toBe("Arquibancada (Inter Oeste)");
    expect(rotuloSetorCurto("arquibancada", {})).toBe("Arquibancada");
    expect(rotuloSetorCurto("arquibancada", { arquibancada: "Cadeira Superior Sul" })).toBe("Cadeira Superior Sul");
  });
});
