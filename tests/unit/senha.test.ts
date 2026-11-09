import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/pg", () => ({ pool: () => ({ query: async () => ({ rows: [] }) }) }));
import { conferirHash, gerarHash, problemaSenha } from "@/lib/auth/senha";

describe("senha", () => {
  it("guarda só o hash (com sal) e confere certo", async () => {
    const h = await gerarHash("Ingressos2026");
    expect(h).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
    expect(h).not.toContain("Ingressos2026");
    expect(await gerarHash("Ingressos2026")).not.toBe(h); // sal diferente a cada vez
    expect(await conferirHash("Ingressos2026", h)).toBe(true);
    expect(await conferirHash("ingressos2026", h)).toBe(false);
    expect(await conferirHash("qualquer", "lixo")).toBe(false);
  });
  it("exige senha razoável", () => {
    expect(problemaSenha("curta1")).toMatch(/8 caracteres/);
    expect(problemaSenha("somenteletras")).toMatch(/letras e números/);
    expect(problemaSenha("joao.silva2026", "joao.silva@mrv.com.br")).toMatch(/e-mail/);
    expect(problemaSenha("Arena2026mrv", "joao@mrv.com.br")).toBeNull();
  });
});
