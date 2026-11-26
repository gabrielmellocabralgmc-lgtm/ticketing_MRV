// Resumo por e-mail ao time de Marketing perto do jogo: uma atualização 36h antes e a
// atualização final 24h antes. Só regras e texto (sem servidor), para poder testar.
import { ROTULO_GRUPO, type ContagemSetor } from "./contagem";

export type EtapaResumo = "resumo_marketing" | "resumo_marketing_final";

const HORA = 3600e3;

/**
 * Qual resumo mandar agora (ou nenhum). As rotinas rodam a cada 30 min, então cada etapa sai
 * na primeira rodada depois da marca. Se a de 36h foi perdida (evento criado em cima da hora,
 * rotina parada), não é mandada atrasada: a final das 24h já cobre.
 */
export function etapaResumoMarketing(inicio: string, agora: number, jaEnviados: Set<string>): EtapaResumo | null {
  const falta = new Date(inicio).getTime() - agora;
  if (falta <= 0) return null;
  if (falta <= 24 * HORA) return jaEnviados.has("resumo_marketing_final") ? null : "resumo_marketing_final";
  if (falta <= 36 * HORA) return jaEnviados.has("resumo_marketing") || jaEnviados.has("resumo_marketing_final") ? null : "resumo_marketing";
  return null;
}

export interface SetorResumo {
  rotulo: string;
  c: ContagemSetor;
  /** "3 · Diretor João" — de quem são as reservas. */
  reservas: string[];
}

/** Bloco de texto com os números de cada setor (os mesmos do Painel do jogo). */
export function textoSetores(setores: SetorResumo[], facial: boolean): string {
  return setores.map(({ rotulo, c, reservas }) => {
    const linhas = [
      `${rotulo.toUpperCase()}: ${c.disponiveis} disponíve${c.disponiveis === 1 ? "l" : "is"} de ${c.capacidade}`,
      `• ${ROTULO_GRUPO.enviados}: ${c.enviados}`,
      `• ${ROTULO_GRUPO.prontos}: ${c.prontos}`,
      ...(facial ? [`• ${ROTULO_GRUPO.facial}: ${c.facial}`] : []),
      `• ${ROTULO_GRUPO.reservados}: ${c.reservados}${reservas.length ? ` (${reservas.join("; ")})` : ""}`,
      `• ${ROTULO_GRUPO.aguardando}: ${c.aguardando}`,
      ...(c.espera ? [`• ${ROTULO_GRUPO.espera}: ${c.espera}`] : []),
    ];
    return linhas.join("\n");
  }).join("\n\n");
}

/** Áreas com cota que ainda não usaram nenhum lugar. */
export function textoSemPedido(areas: { area: string; setor: string; cota: number; ocupados: number }[]): string {
  const sem = areas.filter((a) => a.cota > 0 && a.ocupados === 0);
  return sem.length ? sem.map((a) => `• ${a.area} (${a.setor}): 0 de ${a.cota}`).join("\n") : "Todas as áreas já pediram ingressos. ✓";
}
