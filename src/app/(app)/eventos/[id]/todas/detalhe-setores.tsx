"use client";
import { convidadoDe } from "@/lib/anfitriao";
import { Selo } from "@/components/ui";
import { rotuloSetor, statusPainel, type Setor, type StatusIngresso } from "@/lib/tipos";

export interface LinhaDetalhe {
  id: string; nome: string | null; area_nome: string; setor: Setor; status: StatusIngresso; criado_em: string;
  convidado_de?: string | null; convidado_de_nome?: string | null; anfitriao_externo?: string | null; reservado_para?: string | null;
}

export function DetalheSetores({ linhas, nomes_setores, facial = true }: { linhas: LinhaDetalhe[]; nomes_setores?: Record<string, string>; facial?: boolean }) {
  const setores: Setor[] = ["camarote", "arquibancada"];

  return (
    <div className="space-y-6">
      {setores.map((setor) => {
        const linhasSetor = linhas.filter((l) => l.setor === setor);
        if (!linhasSetor.length) return null;
        return (
          <div key={setor}>
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h3 className="text-base font-bold text-mrv-900">{rotuloSetor(setor, nomes_setores)}</h3>
              <span className="text-sm text-cinza">{linhasSetor.length} na lista</span>
            </div>
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm [&_td]:px-5 [&_td]:py-2 [&_th]:px-5 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-cinza [&_th]:uppercase [&_tbody_tr]:border-t [&_tbody_tr]:border-[#edeeed]">
                <thead><tr><th>Área</th><th>Nome</th>{setor === "camarote" && <th>Convidado de</th>}<th>Status</th></tr></thead>
                <tbody>
                  {linhasSetor.map((l) => (
                    <tr key={l.id}>
                      <td className="font-medium text-cinza">{l.area_nome}</td>
                      {l.status === "reservado"
                        ? <td>🔖 Reservado para <b>{l.reservado_para ?? "—"}</b></td>
                        : <td className={l.nome ? "" : "italic text-cinza"}>{l.nome || "Sem nome"}</td>}
                      {setor === "camarote" && (
                        <td className="text-xs text-cinza">{convidadoDe({ setor, convidado_de: l.convidado_de ?? null, convidado_de_nome: l.convidado_de_nome ?? null, anfitriao_externo: l.anfitriao_externo }) ?? (l.status === "reservado" ? "—" : "Anfitrião")}</td>
                      )}
                      <td>{(() => { const st = statusPainel(l.status, { facial }); return <Selo tom={st.tom}>{st.rotulo}</Selo>; })()}</td>
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
