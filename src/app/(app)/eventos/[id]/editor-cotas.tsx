"use client";
// Cotas do setor numa tabela só: editar a cota de cada área e a capacidade, ver usados e o que
// sobra livre. Remanejar = tirar de uma área e colocar em outra na mesma edição.
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Aviso, Botao, Entrada } from "@/components/ui";
import { salvarCotas } from "../actions";

export interface AreaCota { area_id: string; area_nome: string; cota: number; usados: number }

export function EditorCotas({ evento, setor, capacidade, cotaPorArea, areas }: {
  evento: string; setor: string; capacidade: number; cotaPorArea: boolean; areas: AreaCota[];
}) {
  const [aberto, setAberto] = useState(false);
  const [cap, setCap] = useState(capacidade);
  const [valores, setValores] = useState<Record<string, number>>(() => Object.fromEntries(areas.map((a) => [a.area_id, a.cota])));
  const [motivo, setMotivo] = useState("");
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const soma = Object.values(valores).reduce((n, v) => n + (v || 0), 0);
  const livre = cap - soma;
  const abaixoDoUso = areas.filter((a) => (valores[a.area_id] ?? 0) < a.usados);
  const mudou = cap !== capacidade || areas.some((a) => valores[a.area_id] !== a.cota);

  if (!aberto) {
    return <Botao variante="secundario" onClick={() => setAberto(true)}>{cotaPorArea ? "Editar cotas" : "Editar capacidade"}</Botao>;
  }
  return (
    <div className="space-y-3 rounded-xl border border-mrv-600/40 bg-mrv-50/40 p-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 font-semibold">Capacidade do setor
          <span className="w-24"><Entrada type="number" min={0} value={cap} onChange={(e) => setCap(Number(e.target.value))} className="text-right" /></span>
        </label>
        {cotaPorArea && (
          <span className={clsx("rounded-full px-3 py-1 font-semibold", livre < 0 ? "bg-red-100 text-red-800" : livre > 0 ? "bg-laranja-100 text-[#8a4b0f]" : "bg-mrv-100 text-mrv-700")}>
            {livre < 0 ? `${-livre} acima da capacidade` : livre > 0 ? `${livre} livre(s) para distribuir` : "Tudo distribuído"}
          </span>
        )}
      </div>
      {cotaPorArea && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="text-left text-xs tracking-wide text-cinza uppercase"><th className="py-1.5">Área</th><th className="py-1.5 text-right">Usados</th><th className="py-1.5 text-right">Cota</th><th className="py-1.5 text-right">Diferença</th></tr></thead>
            <tbody>
              {areas.map((a) => {
                const v = valores[a.area_id] ?? 0;
                const dif = v - a.cota;
                return (
                  <tr key={a.area_id} className="border-t border-black/5">
                    <td className="py-1.5">{a.area_nome}</td>
                    <td className="tabular py-1.5 text-right text-cinza">{a.usados}</td>
                    <td className="py-1.5"><div className="ml-auto w-24"><Entrada type="number" min={a.usados} value={v} aria-label={`Cota de ${a.area_nome}`}
                      onChange={(e) => setValores((x) => ({ ...x, [a.area_id]: Math.max(0, Number(e.target.value)) }))}
                      className={clsx("text-right", v < a.usados && "ring-2 ring-red-400")} /></div></td>
                    <td className={clsx("tabular py-1.5 text-right font-semibold", dif > 0 ? "text-mrv-700" : dif < 0 ? "text-laranja-700" : "text-cinza")}>{dif > 0 ? `+${dif}` : dif || "—"}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-black/10 font-semibold"><td className="py-1.5">Soma</td><td className="tabular py-1.5 text-right">{areas.reduce((n, a) => n + a.usados, 0)}</td><td className="tabular py-1.5 text-right">{soma}</td><td /></tr>
            </tbody>
          </table>
        </div>
      )}
      {abaixoDoUso.length > 0 && <Aviso tom="erro">Cota abaixo do que já foi usado: {abaixoDoUso.map((a) => a.area_nome).join(", ")}. Cancele pedidos antes de reduzir.</Aviso>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1 text-sm font-semibold">Motivo (fica no histórico)
          <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: DH não vai usar, 2 passam para Luggo" className="mt-1" />
        </label>
        <Botao disabled={pendente || !mudou || !motivo.trim() || (cotaPorArea && livre < 0) || abaixoDoUso.length > 0}
          onClick={() => iniciar(async () => {
            const r = await salvarCotas(evento, setor, cap, valores, motivo);
            setRetorno(r.ok ? { ok: true, msg: r.mensagem ?? "Salvo." } : { ok: false, msg: r.erro });
            if (r.ok) { setAberto(false); setMotivo(""); }
          })}>Salvar</Botao>
        <Botao variante="fantasma" onClick={() => { setAberto(false); setCap(capacidade); setValores(Object.fromEntries(areas.map((a) => [a.area_id, a.cota]))); }}>Cancelar</Botao>
      </div>
      {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}
    </div>
  );
}
