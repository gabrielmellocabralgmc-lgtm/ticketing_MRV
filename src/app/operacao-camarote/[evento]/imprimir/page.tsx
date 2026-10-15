import { BotaoImprimir } from "@/components/botao-imprimir";
import { Voltar } from "@/components/ui";
import { dataHora, dataLonga } from "@/lib/formato";
import { carregarEvento } from "../../../(app)/eventos/[id]/dados";
import { exigirOperacao } from "../../../(app)/operacao-camarote/acesso";
import { carregarOperacao, type Foto } from "../../../(app)/operacao-camarote/[evento]/dados";

export const metadata = { title: "Relatório da operação" };

const STATUS = { ok: "OK", problema: "PROBLEMA", na: "N/A" } as const;

/** Relatório completo da operação do camarote, pronto para imprimir/salvar em PDF. */
export default async function ImprimirOperacao({ params }: { params: Promise<{ evento: string }> }) {
  await exigirOperacao();
  const { evento } = await params;
  const [ev, op] = await Promise.all([carregarEvento(evento), carregarOperacao(evento)]);
  const resp = new Map(op.respostas.map((r) => [r.item_id, r]));
  const r = op.relatorio;

  const Fotos = ({ fotos }: { fotos: Foto[] }) => fotos.length ? (
    <div className="mt-1 flex flex-wrap gap-2">
      {fotos.map((f) => (
        <figure key={f.id} className="w-36 break-inside-avoid">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/operacao-camarote/foto/${f.id}`} alt={f.legenda ?? "Foto"} className="aspect-square w-full rounded object-cover" />
          <figcaption className="text-[10px] text-cinza">enviada {dataHora(f.enviado_em)}</figcaption>
        </figure>
      ))}
    </div>
  ) : null;

  return (
    <main className="mx-auto max-w-4xl bg-white p-8 text-sm text-tinta print:p-0">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-3 print:hidden"><Voltar href={`/operacao-camarote/${evento}`} rotulo="Operação do jogo" /></div>
          <div className="font-display text-xs font-bold tracking-[0.1em] text-mrv-600">RELATÓRIO DA OPERAÇÃO · CAMAROTE MRV</div>
          <h1 className="font-display text-3xl font-extrabold uppercase">{ev.titulo}</h1>
          <p className="text-cinza first-letter:uppercase">{dataLonga(ev.inicio)}{ev.competicao && ` · ${ev.competicao}`} · gerado em {dataHora(new Date().toISOString())}</p>
        </div>
        <div className="print:hidden"><BotaoImprimir /></div>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Convidados na lista", op.presenca.convidados], ["Chegaram", op.presenca.chegaram],
          ["Abertura / encerramento", `${r?.abertura_camarote?.slice(0, 5) ?? "—"} / ${r?.encerramento_camarote?.slice(0, 5) ?? "—"}`],
          ["Avaliação", r?.avaliacao ? `${r.avaliacao} de 5` : "—"],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg border border-borda p-3"><div className="text-xs text-cinza">{k}</div><div className="text-lg font-bold">{v}</div></div>
        ))}
      </section>

      {(["antes", "depois"] as const).map((m) => {
        const itens = op.itens.filter((i) => i.momento === m);
        return (
          <section key={m} className="mb-6 break-inside-avoid-page">
            <h2 className="mb-1 text-lg font-bold">Check-list {m === "antes" ? "antes do jogo" : "depois do jogo"}</h2>
            <p className="mb-2 text-xs text-cinza">{op.concluido[m] ? `Concluído em ${dataHora(op.concluido[m])}` : "Não concluído"}</p>
            <table className="w-full border-collapse">
              <tbody>
                {itens.map((i) => {
                  const x = resp.get(i.id);
                  return (
                    <tr key={i.id} className="border-t border-borda align-top">
                      <td className="w-28 py-1.5 pr-2 text-xs text-cinza">{i.secao}</td>
                      <td className="py-1.5 pr-2">
                        {i.texto}
                        {x?.observacao && <div className="text-xs text-cinza">{x.observacao}</div>}
                        <Fotos fotos={op.fotos.filter((f) => f.item_id === i.id)} />
                      </td>
                      <td className={`w-24 py-1.5 text-right text-xs font-bold ${x?.status === "problema" ? "text-red-700" : x?.status === "ok" ? "text-mrv-700" : "text-cinza"}`}>
                        {x ? STATUS[x.status] : "—"}
                        {x && <div className="font-normal text-cinza">{dataHora(x.respondido_em).split(" ")[1]}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      <section className="mb-6 break-inside-avoid-page">
        <h2 className="mb-2 text-lg font-bold">Bebidas</h2>
        <table className="tabular w-full border-collapse text-right">
          <thead><tr className="text-xs text-cinza"><th className="py-1 text-left">Bebida</th><th>Sobra anterior</th><th>Contratado</th><th>Contagem antes</th><th>Contagem final</th><th>Consumo</th></tr></thead>
          <tbody>
            {op.bebidas.map((b) => (
              <tr key={b.bebida_id} className="border-t border-borda">
                <td className="py-1 text-left">{b.nome} <span className="text-xs text-cinza">({b.unidade})</span></td>
                <td>{b.sobra_anterior ?? "—"}</td><td>{b.contratado ?? "—"}</td><td>{b.contagem_inicial ?? "—"}</td><td>{b.contagem_final ?? "—"}</td>
                <td className="font-bold">{b.contagem_inicial !== null && b.contagem_final !== null ? b.contagem_inicial - b.contagem_final : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-bold">Relatório geral {r?.finalizado_em ? <span className="text-xs font-normal text-cinza">· finalizado em {dataHora(r.finalizado_em)}</span> : <span className="text-xs font-normal text-laranja-700">· rascunho</span>}</h2>
        {([["Resumo do jogo", r?.resumo], ["Ocorrências", r?.ocorrencias], ["Manutenção e pendências", r?.manutencao], ["Feedback de convidados", r?.feedback]] as const).map(([k, v]) => (
          <div key={k} className="mb-3"><div className="text-xs font-semibold text-cinza uppercase">{k}</div><p className="whitespace-pre-wrap">{v || "—"}</p></div>
        ))}
        <Fotos fotos={op.fotos.filter((f) => f.momento === "relatorio")} />
      </section>
    </main>
  );
}
