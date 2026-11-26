// Contagem dos ingressos de um setor — a MESMA conta no Painel do jogo, em "Todas as áreas"
// e no resumo por e-mail ao Marketing. Sem dependências de servidor (usado no navegador também).
import type { StatusIngresso } from "./tipos";

/** Em qual quadro do painel cada status entra. */
export type Grupo = "enviados" | "prontos" | "facial" | "reservados" | "aguardando" | "espera" | "fora";

export function grupoDoStatus(status: StatusIngresso, facial = true): Grupo {
  switch (status) {
    case "enviado":
    case "confirmado":
    case "presente":
    case "no_show":
      return "enviados";
    case "facial_ok":
      return "prontos";
    case "aprovado":
    case "facial_pendente":
      return facial ? "facial" : "prontos"; // evento sem facial: aprovado já está pronto para envio
    case "reservado":
      return "reservados";
    case "lista_espera":
      return "espera";
    case "convite_enviado":
    case "aguardando_preenchimento":
    case "solicitado":
    case "validado_area":
      return "aguardando";
    default:
      return "fora"; // cancelado, recusado, convite expirado: não ocupam lugar
  }
}

export interface ContagemSetor {
  capacidade: number;
  /** Lugares ocupados (inclui reservas e links ainda não preenchidos). */
  ocupados: number;
  disponiveis: number;
  enviados: number;
  prontos: number;
  facial: number;
  reservados: number;
  /** Preenchidos a validar/aprovar e links aguardando o convidado. */
  aguardando: number;
  espera: number;
}

/**
 * Números do setor. `ocupados` vem do banco (resumo_setores), que é quem decide o que ocupa lugar;
 * "aguardando" é o resto, para que os quadros sempre somem os ocupados:
 * enviados + prontos + facial + reservados + aguardando = ocupados, e ocupados + disponíveis = capacidade.
 */
export function contarSetor(statuses: StatusIngresso[], capacidade: number, ocupados: number, facial = true): ContagemSetor {
  const n = { enviados: 0, prontos: 0, facial: 0, reservados: 0, espera: 0 };
  for (const s of statuses) {
    const g = grupoDoStatus(s, facial);
    if (g !== "aguardando" && g !== "fora") n[g]++;
  }
  const aguardando = Math.max(0, ocupados - n.enviados - n.prontos - n.facial - n.reservados);
  return { capacidade, ocupados, disponiveis: Math.max(0, capacidade - ocupados), ...n, aguardando };
}

/** Rótulos dos quadros (iguais no Painel, em "Todas as áreas" e no e-mail). */
export const ROTULO_GRUPO: Record<Exclude<Grupo, "fora">, string> = {
  enviados: "Enviados",
  prontos: "Prontos para envio",
  facial: "Pendente facial",
  reservados: "Reservados (sem nome)",
  aguardando: "Aguardando dados/aprovação",
  espera: "Lista de espera",
};
