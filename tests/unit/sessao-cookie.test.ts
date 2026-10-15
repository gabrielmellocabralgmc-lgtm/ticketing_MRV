import { beforeAll, describe, expect, it } from "vitest";
import { assinarSessao, DURACAO_SESSAO_S, verificarSessao } from "../../src/lib/auth/sessao-cookie";

const uid = "6661966b-3cf2-4f3d-9dba-0afa7d97815a";
beforeAll(() => { process.env.AUTH_SECRET = "segredo-de-teste-com-mais-de-32-caracteres!"; });

describe("cookie de sessão", () => {
  it("assina e confere", async () => {
    expect(await verificarSessao(await assinarSessao(uid))).toBe(uid);
  });
  it("recusa adulterado, de outro segredo ou expirado", async () => {
    const c = await assinarSessao(uid);
    const [, exp, sig] = c.split(".");
    expect(await verificarSessao(`aaaaaaaa-3cf2-4f3d-9dba-0afa7d97815a.${exp}.${sig}`)).toBeNull();
    expect(await verificarSessao(`${uid}.${Number(exp) + 1}.${sig}`)).toBeNull();
    expect(await verificarSessao(c, Date.now() + (DURACAO_SESSAO_S + 60) * 1000)).toBeNull();
    process.env.AUTH_SECRET = "outro-segredo-diferente-com-mais-de-32-caracteres";
    expect(await verificarSessao(c)).toBeNull();
    expect(await verificarSessao("lixo")).toBeNull();
  });
});
