import { redirect } from "next/navigation";
import { BotaoImprimir } from "@/components/botao-imprimir";
import { dataHora, dataLonga } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

export const metadata = { title: "Lista do camarote" };

// Página própria (fora do layout interno) para imprimir/salvar em PDF: reserva do check-in sem internet.
export default async function ImprimirCamarote({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await exigirSessao();
  if (s.papel === "responsavel") redirect("/eventos");
  const supabase = await supabaseServidor();
  const [{ data: ev }, { data: lista }] = await Promise.all([
    supabase.from("eventos").select("titulo, inicio").eq("id", id).single(),
    supabase.rpc("lista_camarote", { p_evento: id }),
  ]);
  const convidados = (lista ?? []) as { ingresso_id: string; nome: string; cpf_mascarado: string | null; area: string; anfitriao: string; titular: boolean; pedido_id: string; chegada_em: string | null }[];
  const grupos = new Map<string, typeof convidados>();
  for (const c of convidados) grupos.set(c.pedido_id, [...(grupos.get(c.pedido_id) ?? []), c]);
  await supabase.rpc("registrar_auditoria", { p_acao: "exportar", p_entidade: "evento", p_entidade_id: id, p_detalhes: { formato: "impressao_camarote", qtd: convidados.length } });

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Camarote MRV · {ev?.titulo}</h1>
          <p className="text-sm first-letter:uppercase">{dataLonga(ev?.inicio)} · {convidados.length} convidados · impresso em {dataHora(new Date().toISOString())}</p>
        </div>
        <BotaoImprimir />
      </div>
      {[...grupos.values()].map((g) => (
        <section key={g[0].pedido_id} className="mb-4 break-inside-avoid">
          <h2 className="border-b-2 border-black py-1 text-sm font-bold">Anfitrião: {g[0].anfitriao} <span className="font-normal">· {g[0].area}</span></h2>
          <table className="w-full text-sm">
            <tbody>
              {g.map((c) => (
                <tr key={c.ingresso_id} className="border-b border-gray-300">
                  <td className="w-8 py-1.5"><span className="inline-block size-4 border border-black" aria-hidden="true">{c.chegada_em ? "✓" : ""}</span></td>
                  <td className="py-1.5">{c.titular ? <b>{c.nome}</b> : <>↳ {c.nome}</>}</td>
                  <td className="py-1.5 font-mono text-xs">{c.cpf_mascarado}</td>
                  <td className="py-1.5 text-right text-xs">{c.chegada_em ? `chegou ${dataHora(c.chegada_em).split(" ")[1]}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="mt-6 text-xs">Uso interno MRV. Contém dados pessoais: descarte após o evento.</p>
    </main>
  );
}
