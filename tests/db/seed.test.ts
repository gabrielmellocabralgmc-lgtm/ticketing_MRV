import { describe, expect, it } from "vitest";
import { BancoTeste } from "./helpers";

describe("seed de desenvolvimento", () => {
  it("roda sobre as migrações e gera pedidos em várias etapas", async () => {
    const b = await BancoTeste.criar();
    await b.rodarSeed();
    const [{ n }] = await b.sql<{ n: number }>(`select count(*)::int n from perfis`);
    expect(n).toBe(3 + 11);
    const st = await b.sql<{ status: string; n: number }>(
      `select i.status, count(*)::int n from ingressos i join eventos e on e.id = i.evento_id where e.titulo = 'Galo × Cruzeiro' group by 1 order by 1`);
    const m = Object.fromEntries(st.map((x) => [x.status, x.n]));
    expect(m).toMatchObject({ convite_enviado: 3, solicitado: 24, aprovado: 3, validado_area: 6, facial_pendente: 3, facial_ok: 3, lista_espera: 7 });
    const [ev] = await b.sql<{ inicio: string }>(`select to_char(inicio at time zone 'America/Sao_Paulo', 'HH24:MI') inicio from eventos where titulo = 'Galo × Cruzeiro'`);
    expect(ev.inicio).toBe("16:00");
  });
});
