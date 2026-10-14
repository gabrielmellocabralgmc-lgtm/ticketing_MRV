import { describe, expect, it } from "vitest";
import { lerCsv, montarPedidos, sugerirMapa } from "@/lib/importacao/forms";

const CSV = `﻿ID;Hora de início;Nome completo;CPF;Celular (WhatsApp);Área;Nome do convidado;CPF do convidado
1;14/10/2026 10:00;"Silva; Ana";015.292.976-21;31999990000;Comercial Corp;Bruno Souza;12345678909
2;14/10/2026 10:05;Carla Dias;123.456.789-09;31988887777;DH;;
`;

describe("importação do Microsoft Forms", () => {
  it("lê CSV com ; e aspas, sugere o mapeamento e monta os pedidos", () => {
    const t = lerCsv(CSV);
    expect(t.cabecalhos[2]).toBe("Nome completo");
    expect(t.linhas[0][2]).toBe("Silva; Ana");
    const mapa = sugerirMapa(t.cabecalhos);
    expect(mapa).toMatchObject({ nome: 2, cpf: 3, celular: 4, area: 5, nome_convidado: 6, cpf_convidado: 7 });
    const pedidos = montarPedidos(t, mapa);
    expect(pedidos[0]).toMatchObject({ areaSlug: "comercial-corporativo", pessoas: [{ nome: "Silva; Ana" }, { nome: "Bruno Souza", cpf: "12345678909" }] });
    expect(pedidos[1].pessoas).toHaveLength(1);
    expect(pedidos[1].areaSlug).toBe("dh");
  });
});
