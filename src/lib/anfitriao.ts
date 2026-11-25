import type { Setor } from "./tipos";

/**
 * Nome de quem a pessoa é convidada — só no camarote (nos outros setores não se mostra vínculo).
 * Cobre os dois tipos de anfitrião: alguém da lista do jogo (convidado_de) ou alguém de fora
 * (anfitriao_externo do pedido; v_ingressos.convidado_de_nome já faz o coalesce dos dois).
 */
export function convidadoDe(l: {
  setor: Setor; convidado_de: string | null; convidado_de_nome: string | null; anfitriao_externo?: string | null;
}): string | null {
  if (l.setor !== "camarote") return null;
  if (!l.convidado_de && !l.anfitriao_externo) return null;
  return l.convidado_de_nome ?? l.anfitriao_externo ?? "?";
}
