"use client";
// Personalizar as cotas ANTES de criar o evento: parte do padrão do regulamento (Configurações ›
// Áreas) e permite mudar a capacidade de cada setor e a cota de cada área só para este evento.
import { useState } from "react";
import clsx from "clsx";
import { Entrada } from "@/components/ui";
import { ROTULO_SETOR, type Setor } from "@/lib/tipos";

type Qtd = number | { quantidade: number; sob_demanda?: boolean };
export interface PadraoSetor { capacidade: number; cota_por_area?: boolean; areas?: Record<string, Qtd> }
export type PadraoTipo = Record<string, PadraoSetor>;
export interface AreaSimples { slug: string; nome: string }

const qtd = (q: Qtd | undefined) => (typeof q === "object" ? q.quantidade : q ?? 0);

/** Monta as cotas iniciais a partir do padrão, com todas as áreas ativas (0 para quem não tem). */
export function cotasIniciais(padrao: PadraoTipo, areas: AreaSimples[]): PadraoTipo {
  return Object.fromEntries(Object.entries(padrao).map(([setor, cfg]) => [setor, {
    capacidade: cfg.capacidade, cota_por_area: cfg.cota_por_area ?? true,
    areas: Object.fromEntries(areas.map((a) => [a.slug, cfg.areas?.[a.slug] ?? 0])),
  }]));
}

export function CotasNovoEvento({ valor, onChange, areas, camarote }: {
  valor: PadraoTipo; onChange: (v: PadraoTipo) => void; areas: AreaSimples[]; camarote: boolean;
}) {
  const setores = Object.keys(valor).filter((s) => camarote || s !== "camarote");
  const [aberto, setAberto] = useState(setores[0]);
  const mudar = (setor: string, f: (c: PadraoSetor) => PadraoSetor) => onChange({ ...valor, [setor]: f(valor[setor]) });

  return (
    <div className="space-y-3 rounded-xl border border-mrv-600/40 bg-mrv-50/40 p-4">
      <div className="flex flex-wrap gap-2">
        {setores.map((s) => (
          <button key={s} type="button" onClick={() => setAberto(s)} aria-pressed={s === aberto}
            className={clsx("rounded-full px-3 py-1 text-sm font-semibold", s === aberto ? "bg-mrv-700 text-white" : "bg-white text-mrv-700 ring-1 ring-borda")}>
            {ROTULO_SETOR[s as Setor] ?? s}
          </button>
        ))}
      </div>
      {setores.filter((s) => s === aberto).map((s) => {
        const c = valor[s];
        const soma = Object.values(c.areas ?? {}).reduce<number>((n, q) => n + qtd(q), 0);
        const livre = c.capacidade - soma;
        return (
          <div key={s} className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2 font-semibold">Capacidade
                <span className="w-24"><Entrada type="number" min={0} value={c.capacidade} className="text-right"
                  onChange={(e) => mudar(s, (x) => ({ ...x, capacidade: Math.max(0, Number(e.target.value)) }))} /></span>
              </label>
              {c.cota_por_area && (
                <span className={clsx("rounded-full px-3 py-1 font-semibold", livre < 0 ? "bg-red-100 text-red-800" : livre > 0 ? "bg-laranja-100 text-[#8a4b0f]" : "bg-mrv-100 text-mrv-700")}>
                  {livre < 0 ? `${-livre} acima da capacidade` : livre > 0 ? `${livre} livre(s), sem área` : "Tudo distribuído"}
                </span>
              )}
              {!c.cota_por_area && <span className="text-cinza">Sem cota por área (gestão manual pelo Marketing)</span>}
            </div>
            {c.cota_por_area && (
              <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {areas.map((a) => {
                  const q = c.areas?.[a.slug];
                  return (
                    <label key={a.slug} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{a.nome}</span>
                      <span className="w-20 shrink-0"><Entrada type="number" min={0} value={qtd(q)} className="text-right" aria-label={`Cota de ${a.nome}`}
                        onChange={(e) => {
                          const n = Math.max(0, Number(e.target.value));
                          mudar(s, (x) => ({ ...x, areas: { ...x.areas, [a.slug]: typeof q === "object" ? { ...q, quantidade: n } : n } }));
                        }} /></span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-cinza">Só vale para este evento. O padrão continua em Configurações › Áreas e responsáveis.</p>
    </div>
  );
}
