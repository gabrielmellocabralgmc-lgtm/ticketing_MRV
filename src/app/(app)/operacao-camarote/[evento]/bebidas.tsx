"use client";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Aviso, Botao } from "@/components/ui";
import type { Foto, LinhaBebida } from "./dados";
import { salvarBebidas, type LinhaBebidaForm } from "./actions";
import { EnviarFoto, Galeria } from "./fotos";

const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v))));
const so = (v: string) => v.replace(/\D/g, "");

function Entrada({ valor, onChange, travado, rotulo }: { valor: string; onChange: (v: string) => void; travado: boolean; rotulo: string }) {
  return (
    <input value={valor} onChange={(e) => onChange(so(e.target.value))} disabled={travado} inputMode="numeric" aria-label={rotulo}
      className="tabular w-20 rounded-lg bg-white px-2 py-1.5 text-right ring-1 ring-black/15 focus:ring-2 focus:ring-mrv-600 focus:outline-none disabled:bg-fundo disabled:text-tinta/60" />
  );
}

function Bloco({ titulo, sub, children, rodape }: { titulo: string; sub: string; children: React.ReactNode; rodape: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-borda bg-white">
      <header className="border-b border-borda px-4 py-3">
        <h2 className="font-bold">{titulo}</h2>
        <p className="text-sm text-cinza">{sub}</p>
      </header>
      <div className="overflow-x-auto">{children}</div>
      <div className="space-y-2 border-t border-borda px-4 py-3">{rodape}</div>
    </section>
  );
}

/**
 * Bebidas em duas etapas, cada uma com foto obrigatória:
 *  · Antes do jogo: sobra do jogo anterior + contratado = quanto deve haver; contagem confere.
 *  · Depois do jogo: quanto sobrou → consumo (e a sobra vira o ponto de partida do próximo jogo).
 */
export function Bebidas({ evento, linhas, fotos, travadoAntes, travadoDepois }: {
  evento: string; linhas: LinhaBebida[]; fotos: Foto[]; travadoAntes: boolean; travadoDepois: boolean;
}) {
  const [v, setV] = useState(() => Object.fromEntries(linhas.map((l) => [l.bebida_id, {
    contratado: l.contratado?.toString() ?? "", contagem_inicial: l.contagem_inicial?.toString() ?? "", contagem_final: l.contagem_final?.toString() ?? "",
  }])));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const set = (id: string, campo: "contratado" | "contagem_inicial" | "contagem_final", valor: string) => setV((x) => ({ ...x, [id]: { ...x[id], [campo]: valor } }));

  const salvar = (etapa: "antes" | "depois") => iniciar(async () => {
    const dados: LinhaBebidaForm[] = linhas.map((l) => etapa === "antes"
      ? { bebida_id: l.bebida_id, contratado: num(v[l.bebida_id].contratado), contagem_inicial: num(v[l.bebida_id].contagem_inicial) }
      : { bebida_id: l.bebida_id, contagem_final: num(v[l.bebida_id].contagem_final) });
    const r = await salvarBebidas(evento, dados);
    setMsg(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
  });
  const fotosAntes = fotos.filter((f) => f.momento === "bebidas_antes");
  const fotosDepois = fotos.filter((f) => f.momento === "bebidas_depois");
  const th = "px-3 py-2 text-right";

  return (
    <div className="space-y-4">
      {msg && <Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso>}

      <Bloco titulo="Antes do jogo" sub="Quantas bebidas há: a sobra do jogo anterior (vem sozinha) + o que foi contratado para este jogo. Conte e confira."
        rodape={<>
          <div className="flex flex-wrap items-center gap-3">
            <EnviarFoto evento={evento} momento="bebidas_antes" rotulo="📷 Foto das bebidas (obrigatória)" desabilitado={travadoAntes} />
            {!fotosAntes.length && <span className="text-xs text-red-700">Sem foto ainda — é preciso para concluir o check-list de antes do jogo.</span>}
            <Botao className="ml-auto" disabled={pendente || travadoAntes} onClick={() => salvar("antes")}>Salvar antes do jogo</Botao>
          </div>
          <Galeria evento={evento} fotos={fotosAntes} podeRemover={!travadoAntes} />
        </>}>
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs font-semibold tracking-wide text-cinza uppercase">
            <th className="px-3 py-2">Bebida</th><th className={th}>Sobra do jogo anterior</th><th className={th}>Contratado</th>
            <th className={th}>Total esperado</th><th className={th}>Contagem</th><th className={th}>Diferença</th>
          </tr></thead>
          <tbody className="tabular">
            {linhas.map((l) => {
              const x = v[l.bebida_id];
              const contratado = num(x.contratado);
              const total = contratado === null && l.sobra_anterior === null ? null : (l.sobra_anterior ?? 0) + (contratado ?? 0);
              const contagem = num(x.contagem_inicial);
              const dif = contagem !== null && total !== null ? contagem - total : null;
              return (
                <tr key={l.bebida_id} className="border-t border-[#edeeed]">
                  <td className="px-3 py-2"><div className="font-medium">{l.nome}</div><div className="text-xs text-cinza">{l.unidade}</div></td>
                  <td className="px-3 py-2 text-right" title={l.jogo_anterior ? `Contagem final de ${l.jogo_anterior}` : "Sem jogo anterior registrado"}>
                    {l.sobra_anterior ?? "—"}{l.jogo_anterior && <div className="text-[11px] text-cinza">{l.jogo_anterior}</div>}
                  </td>
                  <td className="px-3 py-2 text-right"><Entrada valor={x.contratado} onChange={(s) => set(l.bebida_id, "contratado", s)} travado={travadoAntes} rotulo={`${l.nome}: contratado`} /></td>
                  <td className="px-3 py-2 text-right font-semibold">{total ?? "—"}</td>
                  <td className="px-3 py-2 text-right"><Entrada valor={x.contagem_inicial} onChange={(s) => set(l.bebida_id, "contagem_inicial", s)} travado={travadoAntes} rotulo={`${l.nome}: contagem antes`} /></td>
                  <td className={clsx("px-3 py-2 text-right font-semibold", dif === null ? "text-cinza" : dif === 0 ? "text-mrv-700" : "text-red-700")}>
                    {dif === null ? "—" : dif === 0 ? "ok" : dif > 0 ? `+${dif}` : dif}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Bloco>

      <Bloco titulo="Depois do jogo" sub="Conte o que sobrou: o consumo é calculado a partir da contagem de antes do jogo. A sobra vira o ponto de partida do próximo jogo."
        rodape={<>
          <div className="flex flex-wrap items-center gap-3">
            <EnviarFoto evento={evento} momento="bebidas_depois" rotulo="📷 Foto das sobras (obrigatória)" desabilitado={travadoDepois} />
            {!fotosDepois.length && <span className="text-xs text-red-700">Sem foto ainda — é preciso para concluir o check-list de depois do jogo.</span>}
            <Botao className="ml-auto" disabled={pendente || travadoDepois} onClick={() => salvar("depois")}>Salvar depois do jogo</Botao>
          </div>
          <Galeria evento={evento} fotos={fotosDepois} podeRemover={!travadoDepois} />
        </>}>
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr className="text-left text-xs font-semibold tracking-wide text-cinza uppercase">
            <th className="px-3 py-2">Bebida</th><th className={th}>Havia antes do jogo</th><th className={th}>Sobrou</th><th className={th}>Consumo</th>
          </tr></thead>
          <tbody className="tabular">
            {linhas.map((l) => {
              const x = v[l.bebida_id];
              const inicial = num(x.contagem_inicial);
              const final = num(x.contagem_final);
              const consumo = inicial !== null && final !== null ? inicial - final : null;
              return (
                <tr key={l.bebida_id} className="border-t border-[#edeeed]">
                  <td className="px-3 py-2"><div className="font-medium">{l.nome}</div><div className="text-xs text-cinza">{l.unidade}</div></td>
                  <td className="px-3 py-2 text-right">{inicial ?? "—"}</td>
                  <td className="px-3 py-2 text-right"><Entrada valor={x.contagem_final} onChange={(s) => set(l.bebida_id, "contagem_final", s)} travado={travadoDepois} rotulo={`${l.nome}: sobrou`} /></td>
                  <td className="px-3 py-2 text-right font-semibold">{consumo === null ? "—" : consumo < 0 ? <span className="text-red-700">{consumo}</span> : consumo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Bloco>
    </div>
  );
}
