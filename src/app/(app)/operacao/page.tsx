import Link from "next/link";
import { redirect } from "next/navigation";
import clsx from "clsx";
import { dataLonga } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ListaChegada, type Convidado } from "./lista-chegada";

export const metadata = { title: "Camarote" };

export default async function Operacao({ searchParams }: { searchParams: Promise<{ evento?: string }> }) {
  const s = await exigirSessao();
  if (s.papel === "responsavel") redirect("/eventos");
  const { evento: escolhido } = await searchParams;
  const supabase = await supabaseServidor();
  // eventos de ontem em diante (o jogo do dia aparece primeiro)
  const desde = Date.now() - 24 * 3600e3;
  const { data: eventos } = await supabase.from("eventos").select("id, titulo, inicio, status").order("inicio").limit(60);
  const proximos = (eventos ?? [])
    .filter((e) => new Date(e.inicio).getTime() >= desde && !["rascunho", "encerrado"].includes(e.status))
    .slice(0, 5);
  const ev = proximos.find((e) => e.id === escolhido) ?? proximos[0];

  if (!ev) {
    return <p className="py-16 text-center text-tinta/60">Nenhum jogo próximo.</p>;
  }
  const { data, error } = await supabase.rpc("lista_camarote", { p_evento: ev.id });

  return (
    <div className="mx-auto max-w-xl">
      {proximos.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {proximos.map((e) => (
            <Link key={e.id} href={`?evento=${e.id}`}
              className={clsx("shrink-0 rounded-full px-3 py-1 text-sm", e.id === ev.id ? "bg-mrv-700 text-white" : "bg-white text-mrv-700 ring-1 ring-mrv-700/20")}>
              {e.titulo}
            </Link>
          ))}
        </div>
      )}
      <h1 className="text-xl font-bold text-mrv-900">Camarote · {ev.titulo}</h1>
      <p className="mb-4 text-sm text-tinta/60 first-letter:uppercase">{dataLonga(ev.inicio)}</p>
      {error ? <p className="text-red-700">Sem acesso à lista do camarote.</p> : <ListaChegada convidados={(data ?? []) as Convidado[]} />}
    </div>
  );
}
