import type { Metadata } from "next";
import Link from "next/link";
import { BotaoLink, Cartao, Selo, Titulo, Vazio } from "@/components/ui";
import { dataLonga, dataHora } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROTULO_SETOR, ROTULO_STATUS_EVENTO, type Evento, type Setor } from "@/lib/tipos";

export const metadata: Metadata = { title: "Eventos" };

export default async function Eventos() {
  const s = await exigirSessao();
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("eventos").select("*").order("inicio", { ascending: false }).limit(60);
  const eventos = ((data ?? []) as Evento[]).filter((e) => s.staff || e.status !== "rascunho");
  const resumos = await Promise.all(
    eventos.map(async (e) => {
      const { data: r } = await supabase.rpc("resumo_setores", { p_evento: e.id });
      return [e.id, (r ?? []) as { setor: Setor; capacidade: number; ocupados: number; em_espera: number }[]] as const;
    }),
  );
  const porEvento = Object.fromEntries(resumos);
  const agora = Date.now();
  const proximos = eventos.filter((e) => new Date(e.inicio).getTime() >= agora - 6 * 3600e3).reverse();
  const passados = eventos.filter((e) => new Date(e.inicio).getTime() < agora - 6 * 3600e3);

  const Lista = ({ itens }: { itens: Evento[] }) =>
    itens.length === 0 ? (
      <Vazio>Nenhum evento.</Vazio>
    ) : (
      <div className="grid gap-4 md:grid-cols-2">
        {itens.map((e) => (
          <Link key={e.id} href={`/eventos/${e.id}`} className="group">
            <Cartao className="h-full transition group-hover:ring-mrv-600/40">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold tracking-wide text-laranja-500 uppercase">
                    {e.tipo === "jogo" ? e.competicao ?? "Jogo" : "Show"}
                    {e.concorrido && " · concorrido"}
                  </div>
                  <h2 className="mt-0.5 text-lg font-bold text-mrv-900">{e.titulo}</h2>
                  <p className="text-sm text-tinta/70 first-letter:uppercase">{dataLonga(e.inicio)}</p>
                </div>
                <Selo tom={e.status === "aberto" ? "verde" : e.status === "rascunho" ? "amarelo" : "cinza"}>{ROTULO_STATUS_EVENTO[e.status]}</Selo>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {(porEvento[e.id] ?? []).map((r) => (
                  <div key={r.setor}>
                    <span className="text-tinta/60">{ROTULO_SETOR[r.setor]}: </span>
                    <span className="tabular font-semibold">{r.ocupados}/{r.capacidade}</span>
                    {r.em_espera > 0 && <span className="text-xs text-amber-700"> · {r.em_espera} em espera</span>}
                  </div>
                ))}
              </div>
              {e.prazo_solicitacao && e.status === "aberto" && (
                <p className="mt-3 text-xs text-tinta/60">Solicitações até {dataHora(e.prazo_solicitacao)}</p>
              )}
            </Cartao>
          </Link>
        ))}
      </div>
    );

  return (
    <>
      <Titulo
        sub={s.staff ? "Jogos e shows na Arena MRV" : `Você responde por: ${s.areas.map((a) => a.nome).join(", ") || "nenhuma área"}`}
        acoes={s.staff && <BotaoLink href="/eventos/novo" variante="primario">Novo evento</BotaoLink>}
      >
        Eventos
      </Titulo>
      <h2 className="mb-3 text-sm font-semibold tracking-wide text-tinta/60 uppercase">Próximos</h2>
      <Lista itens={proximos} />
      {passados.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-sm font-semibold tracking-wide text-tinta/60 uppercase">Anteriores</h2>
          <Lista itens={passados} />
        </>
      )}
    </>
  );
}
