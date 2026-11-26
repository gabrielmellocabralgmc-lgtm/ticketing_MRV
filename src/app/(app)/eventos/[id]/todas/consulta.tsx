"use client";
import { useMemo, useState } from "react";
import { Cartao, Entrada, Selecao, Selo, Vazio } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { celular as fmtCelular } from "@/lib/formato";
import { normalizarTexto } from "@/lib/texto";
import { convidadoDe } from "@/lib/anfitriao";
import { rotuloSetor, statusPainel, type NomesSetores, type Setor, type StatusIngresso } from "@/lib/tipos";

export interface LinhaConsulta {
  id: string; nome: string | null; cpf: string | null; celular: string | null; email: string | null;
  area_nome: string; setor: Setor; status: StatusIngresso; resgateAberto: boolean;
  convidado_de?: string | null; convidado_de_nome?: string | null; anfitriao_externo?: string | null; reservado_para?: string | null;
}

const anfitriaoDe = (l: LinhaConsulta) =>
  convidadoDe({ setor: l.setor, convidado_de: l.convidado_de ?? null, convidado_de_nome: l.convidado_de_nome ?? null, anfitriao_externo: l.anfitriao_externo });

/** Lista única de todos os convidados do evento, com busca por nome/CPF e filtro por área. Só leitura. */
export function ConsultaTodas({ evento, linhas, resgate, nomes, todasAreas = [], facial = true }: {
  evento: string; linhas: LinhaConsulta[]; resgate: boolean; nomes: NomesSetores; facial?: boolean;
  /** Áreas com cota no evento (o filtro mostra todas, mesmo as que ainda não cadastraram ninguém). */
  todasAreas?: string[];
}) {
  const [busca, setBusca] = useState("");
  const [area, setArea] = useState("");
  const areas = useMemo(() => [...new Set([...todasAreas, ...linhas.map((l) => l.area_nome)])], [linhas, todasAreas]);
  const termo = normalizarTexto(busca);
  const digitos = busca.replace(/\D/g, "");
  const filtradas = linhas.filter((l) => (!area || l.area_nome === area)
    && (!busca.trim() || normalizarTexto(l.nome ?? "").includes(termo) || normalizarTexto(l.reservado_para).includes(termo)
      || normalizarTexto(anfitriaoDe(l)).includes(termo) || (digitos.length >= 3 && (l.cpf ?? "").includes(digitos))));
  const reservas = linhas.filter((l) => l.status === "reservado").length;

  return (
    <Cartao>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-mrv-900">Todos os convidados</h2>
          <p className="text-sm text-cinza">{filtradas.length} de {linhas.length} convidado(s){reservas > 0 && <> · <span className="font-semibold text-laranja-700">🔖 {reservas} reserva(s) sem nome</span></>}</p>
        </div>
        <a href={`/eventos/${evento}/exportar`} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-mrv-700 ring-1 ring-mrv-600 hover:bg-mrv-50">Baixar planilha</a>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Buscar por nome, CPF ou anfitrião</span>
          <Entrada id="busca-todas" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Maria ou 123.456" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Área</span>
          <Selecao id="area-todas" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Todas as áreas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </Selecao>
        </label>
      </div>
      {filtradas.length === 0 ? <Vazio>Ninguém encontrado.</Vazio> : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm [&_td]:px-5 [&_td]:py-3 [&_th]:bg-[#fafafa] [&_th]:px-5 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-cinza [&_th]:uppercase [&_tbody_tr]:border-t [&_tbody_tr]:border-[#edeeed]">
            <thead><tr><th>Nome</th><th>CPF</th><th>Contato</th><th>Área</th><th>Convidado de</th><th>Situação</th></tr></thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={l.id} className={l.status === "reservado" ? "bg-laranja-100/40" : undefined}>
                  <td className="font-medium">{l.status === "reservado"
                    ? <>🔖 Reservado para <b>{l.reservado_para ?? "—"}</b></>
                    : l.nome ?? <span className="text-cinza">(sem nome)</span>}</td>
                  <td className="font-mono text-xs whitespace-nowrap">{l.cpf ? formatarCpf(l.cpf) : "—"}</td>
                  <td className="text-xs">{l.celular ? fmtCelular(l.celular) : "—"}{l.email && <div className="text-cinza">{l.email}</div>}</td>
                  <td>{l.area_nome}<div className="text-xs text-cinza">{rotuloSetor(l.setor, nomes)}</div></td>
                  <td className="text-xs text-cinza">{anfitriaoDe(l) ?? (l.setor === "camarote" && l.status !== "reservado" ? "Anfitrião" : "—")}</td>
                  <td>{(() => { const st = statusPainel(l.status, { facial, resgate, resgateAberto: l.resgateAberto }); return <Selo tom={st.tom}>{st.rotulo}</Selo>; })()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}
