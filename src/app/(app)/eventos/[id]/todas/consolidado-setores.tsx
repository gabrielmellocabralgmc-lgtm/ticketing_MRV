"use client";
import { rotuloSetor, type Setor, type StatusIngresso } from "@/lib/tipos";

export interface LinhaConsolidado {
  setor: Setor; status: StatusIngresso;
}

export interface ResumoSetor {
  setor: Setor; capacidade: number; ocupados: number;
}

const ENVIADOS: StatusIngresso[] = ["enviado", "confirmado", "presente"];
const SOLICITADOS: StatusIngresso[] = ["solicitado", "validado_area", "aprovado", "facial_pendente", "facial_ok"];

export function ConsolidadoSetores({ linhas, setores, nomes_setores }: { linhas: LinhaConsolidado[]; setores: ResumoSetor[]; nomes_setores?: Record<string, string> }) {
  const setoresLista: Setor[] = ["camarote", "arquibancada"];

  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2">
      {setoresLista.map((setor) => {
        const linhasSetor = linhas.filter((l) => l.setor === setor);
        const setorInfo = setores.find((s) => s.setor === setor);
        if (!linhasSetor.length || !setorInfo) return null;
        const enviados = linhasSetor.filter((l) => ENVIADOS.includes(l.status)).length;
        const solicitados = linhasSetor.filter((l) => SOLICITADOS.includes(l.status)).length;
        const disponiveis = setorInfo.capacidade - enviados - solicitados;

        return (
          <div key={setor} className="rounded-2xl border border-borda bg-gradient-to-br from-white to-fundo p-6">
            <h3 className="mb-4 text-lg font-bold text-mrv-900">{rotuloSetor(setor, nomes_setores)}</h3>
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-tinta/70">Enviados/Confirmados</span>
                <span className="text-4xl font-bold tabular text-mrv-700">{enviados}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-tinta/70">Solicitados/Pendentes</span>
                <span className="text-4xl font-bold tabular text-orange-700">{solicitados}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-tinta/70">Disponíveis</span>
                <span className="text-4xl font-bold tabular text-cinza">{disponiveis}</span>
              </div>
              <div className="border-t border-borda pt-3">
                <span className="text-xs font-semibold uppercase text-cinza">Capacidade</span>
                <span className="block text-2xl font-bold text-tinta">{setorInfo.capacidade}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
