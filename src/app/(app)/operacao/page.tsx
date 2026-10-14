import Link from "next/link";
import { redirect } from "next/navigation";
import clsx from "clsx";
import { CabecalhoJogo } from "@/components/jogo";
import { CHAVE_ESCUDO_ATLETICO, chaveEscudoAdversario, imagensDisponiveis } from "@/lib/imagens";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ListaChegada, type Convidado, type WalkinOperacao } from "./lista-chegada";

export const metadata = { title: "Camarote" };

export default async function Operacao({ searchParams }: { searchParams: Promise<{ evento?: string }> }) {
  const s = await exigirSessao();
  if (s.papel === "responsavel") redirect("/eventos");
  const { evento: escolhido } = await searchParams;
  const supabase = await supabaseServidor();
  // eventos de ontem em diante (o jogo do dia aparece primeiro)
  const desde = Date.now() - 24 * 3600e3;
  const { data: eventos } = await supabase.from("eventos").select("id, titulo, adversario, competicao, inicio, abertura_portoes, status").order("inicio").limit(60);
  const proximos = (eventos ?? [])
    .filter((e) => new Date(e.inicio).getTime() >= desde && !["rascunho", "encerrado"].includes(e.status))
    .slice(0, 5);
  const ev = proximos.find((e) => e.id === escolhido) ?? proximos[0];

  if (!ev) {
    return <p className="py-16 text-center text-tinta/60">Nenhum jogo próximo.</p>;
  }
  const [{ data, error }, img, { data: walkins }] = await Promise.all([
    supabase.rpc("lista_camarote", { p_evento: ev.id }), imagensDisponiveis(), supabase.rpc("lista_walkins", { p_evento: ev.id }),
  ]);

  return (
    <>
    <CabecalhoJogo ev={ev} tamanho="m" rotulo="Camarote MRV" escudoAtletico={img[CHAVE_ESCUDO_ATLETICO]} escudoAdversario={img[chaveEscudoAdversario(ev.id)]} />
    <div className="mx-auto max-w-xl">
      {proximos.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {proximos.map((e) => (
            <Link key={e.id} href={`?evento=${e.id}`}
              className={clsx("shrink-0 rounded-full px-3 py-1 text-sm", e.id === ev.id ? "bg-mrv-700 text-white" : "bg-white text-mrv-700 ring-1 ring-borda")}>
              {e.titulo}
            </Link>
          ))}
        </div>
      )}
      <div className="mb-3 flex justify-end">
        <a href={`/eventos/${ev.id}/camarote/imprimir`} target="_blank" rel="noopener" className="text-sm font-semibold text-mrv-700 underline">
          Imprimir lista (reserva sem internet)
        </a>
      </div>
      {error ? <p className="text-red-700">Sem acesso à lista do camarote.</p>
        : <ListaChegada evento={ev.id} convidados={(data ?? []) as Convidado[]} walkins={(walkins ?? []) as WalkinOperacao[]} />}
    </div>
    </>
  );
}
