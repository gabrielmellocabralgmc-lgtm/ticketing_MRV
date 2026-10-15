import { Voltar } from "@/components/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { dataHora, dataLonga } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROTULO_SETOR, type Setor } from "@/lib/tipos";

export const metadata = { title: "Relatório do jogo" };

interface Linha {
  setor: Setor; area: string; cota: number | null; pedidos: number; aprovados: number; enviados: number; confirmados: number;
  presentes: number; no_show: number; cancelados: number; recusados: number; espera_nao_atendida: number; convites_expirados: number;
}

const COLUNAS: { chave: keyof Linha; rotulo: string }[] = [
  { chave: "cota", rotulo: "Cota" }, { chave: "pedidos", rotulo: "Pedidos" }, { chave: "aprovados", rotulo: "Aprovados" },
  { chave: "enviados", rotulo: "Enviados" }, { chave: "confirmados", rotulo: "Aceitos" }, { chave: "presentes", rotulo: "Presentes" },
  { chave: "no_show", rotulo: "No-show" }, { chave: "cancelados", rotulo: "Cancel." }, { chave: "recusados", rotulo: "Recus." },
  { chave: "espera_nao_atendida", rotulo: "Espera" }, { chave: "convites_expirados", rotulo: "Conv. exp." },
];

// Relatório pós-evento por área (imprimir ou salvar em PDF). Sem dados pessoais.
export default async function Relatorio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await exigirSessao();
  if (!s.staff) redirect("/eventos");
  const supabase = await supabaseServidor();
  const [{ data: ev }, { data }] = await Promise.all([
    supabase.from("eventos").select("titulo, inicio, status, competicao").eq("id", id).single(),
    supabase.rpc("relatorio_evento", { p_evento: id }),
  ]);
  const linhas = (data ?? []) as Linha[];
  const setores = [...new Set(linhas.map((l) => l.setor))];
  const soma = (ls: Linha[], k: keyof Linha) => ls.reduce((n, l) => n + (Number(l[k]) || 0), 0);

  return (
    <main className="mx-auto max-w-5xl bg-white p-8 text-tinta print:p-0">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 print:hidden"><Voltar href={`/eventos/${id}`} rotulo="Painel do jogo" /></div>
          <div className="font-display text-xs font-bold tracking-[0.1em] text-mrv-600">RELATÓRIO PÓS-EVENTO · INGRESSOS MRV</div>
          <h1 className="font-display text-3xl font-extrabold uppercase">{ev?.titulo}</h1>
          <p className="text-sm text-cinza first-letter:uppercase">{dataLonga(ev?.inicio)}{ev?.competicao && ` · ${ev.competicao}`} · gerado em {dataHora(new Date().toISOString())}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Link href={`/eventos/${id}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-mrv-700 ring-1 ring-mrv-600">Voltar</Link>
          <BotaoImprimir />
        </div>
      </div>
      {ev && !["realizado", "encerrado"].includes(ev.status) && (
        <p className="mb-4 rounded-lg bg-laranja-100 px-3 py-2 text-sm text-[#5c3307] print:hidden">O evento ainda não foi encerrado: presentes e no-show só aparecem depois do encerramento.</p>
      )}
      {setores.map((st) => {
        const ls = linhas.filter((l) => l.setor === st);
        return (
          <section key={st} className="mb-8 break-inside-avoid">
            <h2 className="mb-2 border-b-2 border-tinta pb-1 text-lg font-bold">{ROTULO_SETOR[st]}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-cinza uppercase">
                  <th className="py-1.5 pr-3">Área</th>
                  {COLUNAS.map((c) => <th key={c.chave} className="px-2 py-1.5 text-right whitespace-nowrap">{c.rotulo}</th>)}
                  <th className="py-1.5 pl-2 text-right">Uso</th>
                </tr>
              </thead>
              <tbody>
                {ls.map((l) => (
                  <tr key={l.area} className="border-b border-[#e5e5e5]">
                    <td className="py-1.5">{l.area}</td>
                    {COLUNAS.map((c) => <td key={c.chave} className="tabular px-2 py-1.5 text-right">{l[c.chave] ?? "—"}</td>)}
                    <td className="tabular py-1.5 pl-2 text-right">{l.cota ? `${Math.round((l.aprovados / l.cota) * 100)}%` : "—"}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className="py-1.5">Total</td>
                  {COLUNAS.map((c) => <td key={c.chave} className="tabular px-2 py-1.5 text-right">{soma(ls, c.chave)}</td>)}
                  <td />
                </tr>
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="text-xs text-cinza">
        Aprovados inclui enviados, aceitos, presentes e no-show. No-show é medido no camarote (check-in). “Espera” = pedidos que ficaram na lista de espera. Uso = aprovados ÷ cota da área.
      </p>
    </main>
  );
}
