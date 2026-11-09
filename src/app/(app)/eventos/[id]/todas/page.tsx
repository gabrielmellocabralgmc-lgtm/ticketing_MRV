import { redirect } from "next/navigation";
import { CabecalhoJogo } from "@/components/jogo";
import { Cartao } from "@/components/ui";
import { CHAVE_ESCUDO_ATLETICO, chaveEscudoAdversario, imagensDisponiveis } from "@/lib/imagens";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServico, supabaseServidor } from "@/lib/supabase/server";
import { rotuloSetor, type Setor, type StatusIngresso } from "@/lib/tipos";
import { AbasMarketing } from "../abas-marketing";
import { carregarEvento, carregarResumo } from "../dados";
import { ConsultaTodas, type LinhaConsulta } from "./consulta";

export const metadata = { title: "Todas as áreas" };

const INATIVOS: StatusIngresso[] = ["cancelado", "recusado", "convite_expirado"];

// Consulta de todos os ingressos do evento, área por área (Marketing MRV e Admin). Só leitura.
export default async function TodasAsAreas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await exigirSessao();
  if (!s.verTudo) redirect(`/eventos/${id}`);
  const [ev, { linhas }, img] = await Promise.all([carregarEvento(id), carregarResumo(id), imagensDisponiveis()]);
  const { data } = await (await supabaseServidor()).from("v_ingressos")
    .select("id, nome, cpf, celular, email, area_nome, area_ordem, setor, status, criado_em")
    .eq("evento_id", id).order("area_ordem").order("criado_em");
  const ativos = ((data ?? []) as (Omit<LinhaConsulta, "resgateAberto"> & { area_ordem: number; criado_em: string })[])
    .filter((l) => !INATIVOS.includes(l.status));
  const resgates = new Set<string>();
  if (ev.resgate_unico && ativos.length) {
    const { data: digs } = await (await supabaseServico()).from("ingressos_digitais").select("ingresso_id, resgate_aberto_em").eq("evento_id", id);
    for (const d of (digs ?? []) as { ingresso_id: string | null; resgate_aberto_em: string | null }[]) if (d.ingresso_id && d.resgate_aberto_em) resgates.add(d.ingresso_id);
  }
  const marketing = s.areas.find((a) => linhas.some((l) => l.area_id === a.id && l.cota !== null));
  const resumo = linhas.filter((l) => l.cota !== null && l.cota > 0);

  return (
    <>
      <CabecalhoJogo ev={ev} tamanho="m" escudoAtletico={img[CHAVE_ESCUDO_ATLETICO]} escudoAdversario={img[chaveEscudoAdversario(id)]}
        voltar={{ href: s.papel === "admin" ? `/eventos/${id}` : "/eventos", rotulo: s.papel === "admin" ? "Painel do evento" : "Eventos" }} />
      {s.papel === "marketing" && <AbasMarketing evento={id} atual="todas" area={marketing?.id} />}

      <Cartao className="mb-6">
        <h2 className="mb-1 text-lg font-bold text-mrv-900">Resumo por área</h2>
        <p className="mb-4 text-sm text-cinza">Quantos convidados cada área já cadastrou. Só para consulta.</p>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm [&_td]:px-5 [&_td]:py-2.5 [&_th]:px-5 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-cinza [&_th]:uppercase [&_tbody_tr]:border-t [&_tbody_tr]:border-[#edeeed]">
            <thead><tr><th>Área</th><th>Setor</th><th className="text-right">Cota</th><th className="text-right">Cadastrados</th><th className="text-right">Faltam</th></tr></thead>
            <tbody>
              {resumo.map((l) => (
                <tr key={`${l.setor}-${l.area_id}`}>
                  <td className="font-medium">{l.area_nome}</td>
                  <td className="text-cinza">{rotuloSetor(l.setor as Setor, ev.nomes_setores)}</td>
                  <td className="tabular text-right">{l.cota}</td>
                  <td className="tabular text-right font-semibold">{l.ocupados}</td>
                  <td className={`tabular text-right ${l.cota! - l.ocupados > 0 ? "text-orange-700" : "text-mrv-700"}`}>{Math.max(0, l.cota! - l.ocupados)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Total</td><td />
                <td className="tabular text-right">{resumo.reduce((n, l) => n + (l.cota ?? 0), 0)}</td>
                <td className="tabular text-right">{resumo.reduce((n, l) => n + l.ocupados, 0)}</td>
                <td className="tabular text-right">{resumo.reduce((n, l) => n + Math.max(0, (l.cota ?? 0) - l.ocupados), 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Cartao>

      <ConsultaTodas evento={id} resgate={ev.resgate_unico} nomes={ev.nomes_setores} todasAreas={[...new Set(resumo.map((l) => l.area_nome))]}
        linhas={ativos.map(({ id: i, nome, cpf, celular, email, area_nome, setor, status }) => ({ id: i, nome, cpf, celular, email, area_nome, setor, status, resgateAberto: resgates.has(i) }))} />
    </>
  );
}
