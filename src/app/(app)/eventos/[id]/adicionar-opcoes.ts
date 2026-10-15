import type { Setor } from "@/lib/tipos";
import type { LinhaResumo } from "./dados";

export interface OpcaoSetor {
  setor: Setor;
  /** Saldo por área (cota − ocupados); null = setor sem cota por área. */
  saldos: Record<string, number | null>;
  disponiveis: number;
  /** Cota ainda não distribuída a nenhuma área. */
  livre: number;
}

/** Saldos por setor/área para o "+ Adicionar convidado" (Admin e Marketing). */
export function opcoesAdicionar(
  setores: { setor: Setor; capacidade: number; ocupados: number; alocado: number; cota_por_area: boolean }[],
  linhas: LinhaResumo[], areas: { id: string }[],
): OpcaoSetor[] {
  return setores.map((st) => ({
    setor: st.setor,
    disponiveis: Math.max(0, st.capacidade - st.ocupados),
    livre: st.cota_por_area ? Math.max(0, st.capacidade - st.alocado) : 0,
    saldos: Object.fromEntries(areas.map((a) => {
      const l = linhas.find((x) => x.setor === st.setor && x.area_id === a.id);
      return [a.id, st.cota_por_area ? Math.max(0, (l?.cota ?? 0) - (l?.ocupados ?? 0)) : null];
    })),
  }));
}
