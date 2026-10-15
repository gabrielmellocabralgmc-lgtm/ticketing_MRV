"use client";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Aviso, Botao } from "@/components/ui";
import type { LinhaBebida } from "./dados";
import { salvarBebidas, type LinhaBebidaForm } from "./actions";

type Campo = "contratado" | "contagem_inicial" | "contagem_final";
const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v))));

/**
 * Controle de bebidas: sobra do jogo anterior (automática) + contratado = esperado.
 * Antes do jogo: contagem inicial (confere com o esperado). Depois: contagem final → consumo e sobra do próximo jogo.
 */
export function Bebidas({ evento, linhas, travadoAntes, travadoDepois }: {
  evento: string; linhas: LinhaBebida[]; travadoAntes: boolean; travadoDepois: boolean;
}) {
  const [valores, setValores] = useState<Record<string, Record<Campo, string>>>(() =>
    Object.fromEntries(linhas.map((l) => [l.bebida_id, {
      contratado: l.contratado?.toString() ?? "", contagem_inicial: l.contagem_inicial?.toString() ?? "", contagem_final: l.contagem_final?.toString() ?? "",
    }])));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const set = (id: string, c: Campo, v: string) => setValores((x) => ({ ...x, [id]: { ...x[id], [c]: v.replace(/\D/g, "") } }));

  const salvar = () => iniciar(async () => {
    const dados: LinhaBebidaForm[] = linhas.map((l) => ({
      bebida_id: l.bebida_id,
      ...(!travadoAntes && { contratado: num(valores[l.bebida_id].contratado), contagem_inicial: num(valores[l.bebida_id].contagem_inicial) }),
      ...(!travadoDepois && { contagem_final: num(valores[l.bebida_id].contagem_final) }),
    }));
    const r = await salvarBebidas(evento, dados);
    setMsg(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
  });

  const entrada = (l: LinhaBebida, c: Campo, travado: boolean) => (
    <input value={valores[l.bebida_id][c]} onChange={(e) => set(l.bebida_id, c, e.target.value)} disabled={travado}
      inputMode="numeric" aria-label={`${l.nome}: ${c.replace("_", " ")}`}
      className="tabular w-20 rounded-lg bg-white px-2 py-1.5 text-right ring-1 ring-black/15 focus:ring-2 focus:ring-mrv-600 focus:outline-none disabled:bg-fundo disabled:text-tinta/60" />
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-cinza">
        A <b>sobra</b> vem sozinha da contagem final do jogo anterior. Some o <b>contratado</b> para este jogo e confira na <b>contagem antes</b>.
        Depois do jogo, a <b>contagem final</b> vira a sobra do próximo.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-borda bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold tracking-wide text-cinza uppercase">
              <th className="px-3 py-2">Bebida</th>
              <th className="px-3 py-2 text-right">Sobra anterior</th>
              <th className="px-3 py-2 text-right">Contratado</th>
              <th className="px-3 py-2 text-right">Esperado</th>
              <th className="px-3 py-2 text-right">Contagem antes</th>
              <th className="px-3 py-2 text-right">Diferença</th>
              <th className="px-3 py-2 text-right">Contagem final</th>
              <th className="px-3 py-2 text-right">Consumo</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {linhas.map((l) => {
              const v = valores[l.bebida_id];
              const sobra = l.sobra_anterior ?? 0;
              const contratado = num(v.contratado);
              const esperado = contratado === null && l.sobra_anterior === null ? null : sobra + (contratado ?? 0);
              const inicial = num(v.contagem_inicial);
              const final = num(v.contagem_final);
              const dif = inicial !== null && esperado !== null ? inicial - esperado : null;
              const consumo = inicial !== null && final !== null ? inicial - final : null;
              return (
                <tr key={l.bebida_id} className="border-t border-[#edeeed]">
                  <td className="px-3 py-2"><div className="font-medium">{l.nome}</div><div className="text-xs text-cinza">{l.unidade}</div></td>
                  <td className="px-3 py-2 text-right" title={l.jogo_anterior ? `Contagem final de ${l.jogo_anterior}` : "Sem jogo anterior registrado"}>
                    {l.sobra_anterior ?? "—"}{l.jogo_anterior && <div className="text-[11px] text-cinza">{l.jogo_anterior}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">{entrada(l, "contratado", travadoAntes)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{esperado ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{entrada(l, "contagem_inicial", travadoAntes)}</td>
                  <td className={clsx("px-3 py-2 text-right font-semibold", dif === null ? "text-cinza" : dif === 0 ? "text-mrv-700" : "text-red-700")}>
                    {dif === null ? "—" : dif === 0 ? "ok" : dif > 0 ? `+${dif}` : dif}
                  </td>
                  <td className="px-3 py-2 text-right">{entrada(l, "contagem_final", travadoDepois)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{consumo === null ? "—" : consumo < 0 ? <span className="text-red-700">{consumo}</span> : consumo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao onClick={salvar} disabled={pendente || (travadoAntes && travadoDepois)}>{pendente ? "Salvando…" : "Salvar bebidas"}</Botao>
        {travadoAntes && <span className="text-xs text-cinza">Contratado e contagem antes travados (check-list “antes” concluído).</span>}
        {travadoDepois && <span className="text-xs text-cinza">Contagem final travada (check-list “depois” concluído).</span>}
      </div>
      {msg && <Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso>}
    </div>
  );
}
