"use client";
import { rotuloSetor, type Setor, type StatusIngresso } from "@/lib/tipos";

export interface LinhaDetalhe {
  id: string; nome: string; area_nome: string; setor: Setor; status: StatusIngresso; criado_em: string;
}

const ENVIADOS: StatusIngresso[] = ["enviado", "confirmado", "presente"];

export function DetalheSetores({ linhas, nomes_setores }: { linhas: LinhaDetalhe[]; nomes_setores?: Record<string, string> }) {
  const setores: Setor[] = ["camarote", "arquibancada"];

  return (
    <div className="space-y-6">
      {setores.map((setor) => {
        const linhasSetor = linhas.filter((l) => l.setor === setor);
        if (!linhasSetor.length) return null;
        const enviados = linhasSetor.filter((l) => ENVIADOS.includes(l.status)).length;
        const livres = linhasSetor.length - enviados;
        return (
          <div key={setor}>
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h3 className="text-base font-bold text-mrv-900">{rotuloSetor(setor, nomes_setores)}</h3>
              <div className="flex gap-6 text-sm font-semibold text-tinta">
                <span><span className="text-mrv-700">{enviados}</span> enviados/confirmados</span>
                <span><span className="text-orange-700">{livres}</span> livres/pendentes</span>
              </div>
            </div>
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm [&_td]:px-5 [&_td]:py-2 [&_th]:px-5 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-cinza [&_th]:uppercase [&_tbody_tr]:border-t [&_tbody_tr]:border-[#edeeed]">
                <thead><tr><th>Área</th><th>Nome</th><th>Status</th></tr></thead>
                <tbody>
                  {linhasSetor.map((l) => (
                    <tr key={l.id}>
                      <td className="font-medium text-cinza">{l.area_nome}</td>
                      <td>{l.nome}</td>
                      <td className={`text-xs font-semibold uppercase ${ENVIADOS.includes(l.status) ? "text-mrv-700" : "text-orange-700"}`}>{l.status.replace(/_/g, " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
