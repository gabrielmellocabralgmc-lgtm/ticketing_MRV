"use client";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Aviso, Botao } from "@/components/ui";
import { dataHora } from "@/lib/formato";
import type { Foto, ItemChecklist, Momento, Resposta, StatusItem } from "./dados";
import { concluir, reabrir, responder } from "./actions";
import { EnviarFoto, Galeria } from "./fotos";

const OPCOES: { id: StatusItem; rotulo: string; cor: string }[] = [
  { id: "ok", rotulo: "OK", cor: "bg-mrv-600 text-white ring-mrv-600" },
  { id: "problema", rotulo: "Problema", cor: "bg-red-600 text-white ring-red-600" },
  { id: "na", rotulo: "Não se aplica", cor: "bg-tinta/70 text-white ring-tinta/70" },
];

export function Checklist({ evento, momento, itens, respostas, fotos, concluidoEm, avisoBebidas, relatorioEnviado }: {
  evento: string; momento: Momento; itens: ItemChecklist[]; respostas: Resposta[]; fotos: Foto[];
  concluidoEm: string | null; avisoBebidas?: string | null; relatorioEnviado: boolean;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const porItem = new Map(respostas.map((r) => [r.item_id, r]));
  const secoes = [...new Set(itens.map((i) => i.secao))];
  const feitos = itens.filter((i) => porItem.has(i.id)).length;
  const problemas = itens.filter((i) => porItem.get(i.id)?.status === "problema").length;
  const travado = !!concluidoEm;

  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>) =>
    iniciar(async () => { const r = await f(); setMsg(r.ok ? (r.mensagem ? { ok: true, texto: r.mensagem } : null) : { ok: false, texto: r.erro ?? "Erro" }); });

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-b border-borda bg-fundo/95 px-4 py-3 backdrop-blur">
        <div className="min-w-48 flex-1">
          <div className="text-sm font-semibold">{feitos} de {itens.length} itens{problemas > 0 && <span className="text-red-700"> · {problemas} com problema</span>}</div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/10">
            <div className={clsx("h-full rounded-full", problemas ? "bg-laranja-500" : "bg-mrv-600")} style={{ width: `${itens.length ? (feitos / itens.length) * 100 : 0}%` }} />
          </div>
        </div>
        {travado ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-mrv-700">✓ Concluído {dataHora(concluidoEm)}</span>
            {!relatorioEnviado && <Botao variante="fantasma" disabled={pendente} onClick={() => confirm("Reabrir o check-list para alterar?") && rodar(() => reabrir(evento, momento))}>Reabrir</Botao>}
          </div>
        ) : (
          <Botao disabled={pendente || feitos < itens.length} onClick={() => rodar(() => concluir(evento, momento))}>Concluir check-list</Botao>
        )}
      </div>
      {msg && <Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso>}
      {avisoBebidas && !travado && <Aviso tom="alerta">{avisoBebidas}</Aviso>}

      {secoes.map((secao) => (
        <section key={secao} className="overflow-hidden rounded-2xl border border-borda bg-white">
          <h2 className="border-b border-borda bg-[#fafafa] px-4 py-2.5 font-display text-sm font-bold tracking-wide uppercase">{secao}</h2>
          <ul className="divide-y divide-[#edeeed]">
            {itens.filter((i) => i.secao === secao).map((i) => (
              <Linha key={i.id} evento={evento} momento={momento} item={i} resposta={porItem.get(i.id)} travado={travado}
                fotos={fotos.filter((f) => f.item_id === i.id)} onErro={(t) => setMsg({ ok: false, texto: t })} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Linha({ evento, momento, item, resposta, travado, fotos, onErro }: {
  evento: string; momento: Momento; item: ItemChecklist; resposta?: Resposta; travado: boolean; fotos: Foto[]; onErro: (t: string) => void;
}) {
  const [obs, setObs] = useState(resposta?.observacao ?? "");
  const [escolhendo, setEscolhendo] = useState<StatusItem | null>(null);
  const [pendente, iniciar] = useTransition();
  const status = escolhendo ?? resposta?.status ?? null;

  const salvar = (s: StatusItem, texto = obs) => {
    if (s === "problema" && !texto.trim()) { setEscolhendo("problema"); return; } // pede a descrição antes
    iniciar(async () => {
      const r = await responder(evento, item.id, s, texto.trim());
      if (r.ok) setEscolhendo(null); else onErro(r.erro);
    });
  };

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-56 flex-1">
          <div className="font-medium">{item.texto}</div>
          {item.dica && <div className="text-xs text-cinza">{item.dica}</div>}
          {resposta && <div className="mt-0.5 text-[11px] text-cinza">respondido {dataHora(resposta.respondido_em)}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {OPCOES.map((o) => (
            <button key={o.id} type="button" disabled={travado || pendente} onClick={() => salvar(o.id)} aria-pressed={status === o.id}
              className={clsx("rounded-lg px-3 py-1.5 text-xs font-bold ring-1 disabled:cursor-not-allowed",
                status === o.id ? o.cor : "bg-white text-tinta ring-borda hover:bg-fundo", travado && status !== o.id && "opacity-40")}>
              {o.rotulo}
            </button>
          ))}
          <EnviarFoto evento={evento} momento={momento} item={item.id} desabilitado={travado} />
        </div>
      </div>
      {(status === "problema" || (resposta?.observacao && status)) && (
        <div className="mt-2 flex flex-wrap gap-2">
          <textarea value={obs} onChange={(e) => setObs(e.target.value)} disabled={travado} rows={2} maxLength={1000}
            placeholder={status === "problema" ? "Descreva o problema (obrigatório)" : "Observação (opcional)"}
            className="min-w-64 flex-1 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-black/15 focus:ring-2 focus:ring-mrv-600 focus:outline-none" />
          {!travado && (
            <Botao type="button" variante={status === "problema" ? "perigo" : "secundario"} disabled={pendente || (status === "problema" && !obs.trim())}
              onClick={() => salvar(status!, obs)}>Salvar</Botao>
          )}
        </div>
      )}
      <Galeria evento={evento} fotos={fotos} podeRemover={!travado} />
    </li>
  );
}
