import { describe, expect, it } from "vitest";
import { contarSetor, grupoDoStatus } from "@/lib/contagem";
import { statusPainel, type StatusIngresso } from "@/lib/tipos";
import { etapaResumoMarketing, textoSemPedido, textoSetores } from "@/lib/resumo-marketing";

describe("contagem do setor (Painel = Todas as áreas = e-mail)", () => {
  const st: StatusIngresso[] = ["enviado", "confirmado", "facial_ok", "aprovado", "facial_pendente", "reservado", "reservado",
    "solicitado", "validado_area", "lista_espera", "cancelado"];

  it("quadros somam os ocupados e ocupados + disponíveis = capacidade", () => {
    // ocupados do banco: tudo menos lista_espera e cancelado = 9, mais 1 link sem preencher (convite) = 10
    const c = contarSetor(st, 100, 10, true);
    expect(c).toMatchObject({ enviados: 2, prontos: 1, facial: 2, reservados: 2, espera: 1, disponiveis: 90 });
    expect(c.aguardando).toBe(3); // solicitado + validado + o link sem preencher
    expect(c.enviados + c.prontos + c.facial + c.reservados + c.aguardando).toBe(c.ocupados);
    expect(c.ocupados + c.disponiveis).toBe(c.capacidade);
  });

  it("reservas ocupam lugar: disponíveis desconta as reservas", () => {
    const c = contarSetor(["reservado", "reservado", "reservado", "reservado"], 44, 4);
    expect(c.disponiveis).toBe(40);
    expect(c.reservados).toBe(4);
  });

  it("evento sem facial: aprovado já está pronto para envio", () => {
    expect(grupoDoStatus("aprovado", false)).toBe("prontos");
    expect(grupoDoStatus("aprovado", true)).toBe("facial");
    expect(contarSetor(["aprovado"], 10, 1, false)).toMatchObject({ prontos: 1, facial: 0 });
  });

  it("nunca mostra número negativo", () => {
    expect(contarSetor(["enviado", "enviado"], 1, 1)).toMatchObject({ aguardando: 0, disponiveis: 0 });
  });
});

describe("status iguais no Painel e em Todas as áreas", () => {
  it("nomes do painel", () => {
    expect(statusPainel("facial_ok").rotulo).toBe("Pronto para envio");
    expect(statusPainel("aprovado").rotulo).toBe("Pendente facial");
    expect(statusPainel("aprovado", { facial: false }).rotulo).toBe("Pronto para envio");
    expect(statusPainel("reservado")).toEqual({ rotulo: "Reservado", tom: "laranja" });
    expect(statusPainel("confirmado").rotulo).toBe("Recebido");
  });
  it("a cor acompanha o quadro do painel", () => {
    expect(statusPainel("facial_ok").tom).toBe("verde");
    expect(statusPainel("facial_pendente").tom).toBe("vermelho");
  });
});

describe("resumo ao Marketing: 36h e 24h antes do jogo", () => {
  const jogo = "2026-12-05T19:00:00Z";
  const h = (n: number) => new Date(jogo).getTime() - n * 3600e3;
  const nada = new Set<string>();

  it("nada antes das 36h", () => {
    expect(etapaResumoMarketing(jogo, h(37), nada)).toBeNull();
  });
  it("36h: atualização; depois de mandada, não repete", () => {
    expect(etapaResumoMarketing(jogo, h(35.8), nada)).toBe("resumo_marketing");
    expect(etapaResumoMarketing(jogo, h(30), new Set(["resumo_marketing"]))).toBeNull();
  });
  it("24h: atualização final, uma vez só", () => {
    expect(etapaResumoMarketing(jogo, h(23.9), new Set(["resumo_marketing"]))).toBe("resumo_marketing_final");
    expect(etapaResumoMarketing(jogo, h(10), new Set(["resumo_marketing", "resumo_marketing_final"]))).toBeNull();
  });
  it("perdeu a das 36h: só a final, sem mandar a atrasada", () => {
    expect(etapaResumoMarketing(jogo, h(20), nada)).toBe("resumo_marketing_final");
  });
  it("depois do início, nada", () => {
    expect(etapaResumoMarketing(jogo, h(-1), nada)).toBeNull();
  });

  it("texto com os números do painel e as áreas sem pedido", () => {
    const t = textoSetores([{ rotulo: "Arquibancada", c: contarSetor(["reservado", "facial_ok"], 100, 2), reservas: ["1 · Diretor João"] }], true);
    expect(t).toContain("ARQUIBANCADA: 98 disponíveis de 100");
    expect(t).toContain("Reservados (sem nome): 1 (1 · Diretor João)");
    expect(textoSemPedido([{ area: "DI", setor: "Arquibancada", cota: 10, ocupados: 0 }, { area: "DH", setor: "Arquibancada", cota: 10, ocupados: 3 }]))
      .toBe("• DI (Arquibancada): 0 de 10");
    expect(textoSemPedido([])).toContain("Todas as áreas já pediram");
  });
});
