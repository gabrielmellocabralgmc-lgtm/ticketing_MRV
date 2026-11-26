"use client";
import { contarSetor, ROTULO_GRUPO } from "@/lib/contagem";
import { rotuloSetor, type Setor, type StatusIngresso } from "@/lib/tipos";

export interface LinhaConsolidado {
  setor: Setor; status: StatusIngresso;
}

export interface ResumoSetor {
  setor: Setor; capacidade: number; ocupados: number;
}

/** Quadro de cada setor com os MESMOS números do Painel do jogo (reservas contam como ocupadas). */
export function ConsolidadoSetores({ linhas, setores, nomes_setores, facial = true }: {
  linhas: LinhaConsolidado[]; setores: ResumoSetor[]; nomes_setores?: Record<string, string>; facial?: boolean;
}) {
  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2">
      {setores.map((info) => {
        const c = contarSetor(linhas.filter((l) => l.setor === info.setor).map((l) => l.status), info.capacidade, info.ocupados, facial);
        const itens: [string, number, boolean][] = [
          [ROTULO_GRUPO.enviados, c.enviados, false],
          [ROTULO_GRUPO.prontos, c.prontos, false],
          ...(facial ? [[ROTULO_GRUPO.facial, c.facial, c.facial > 0] as [string, number, boolean]] : []),
          [`🔖 ${ROTULO_GRUPO.reservados}`, c.reservados, c.reservados > 0],
          [ROTULO_GRUPO.aguardando, c.aguardando, false],
        ];
        return (
          <div key={info.setor} className="rounded-2xl border border-borda bg-white p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-mrv-900">{rotuloSetor(info.setor, nomes_setores)}</h3>
                <p className="text-xs text-cinza">{c.ocupados} de {c.capacidade} ocupados, contando reservas</p>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold tracking-wide text-mrv-700 uppercase">Disponíveis</div>
                <div className="tabular font-display text-5xl leading-none font-bold text-mrv-700">{c.disponiveis}</div>
              </div>
            </div>
            <dl className="divide-y divide-[#edeeed] text-sm">
              {itens.map(([rotulo, valor, destaque]) => (
                <div key={rotulo} className="flex items-baseline justify-between py-1.5">
                  <dt className={destaque ? "font-semibold text-[#8a4b0f]" : "text-tinta/70"}>{rotulo}</dt>
                  <dd className={`tabular text-xl font-bold ${destaque ? "text-laranja-700" : "text-tinta"}`}>{valor}</dd>
                </div>
              ))}
              {c.espera > 0 && (
                <div className="flex items-baseline justify-between py-1.5">
                  <dt className="text-tinta/70">{ROTULO_GRUPO.espera} <span className="text-xs">(não ocupa lugar)</span></dt>
                  <dd className="tabular text-xl font-bold text-tinta">{c.espera}</dd>
                </div>
              )}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
