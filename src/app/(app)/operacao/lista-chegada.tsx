"use client";
// Operação do camarote: lista dos convidados aprovados e "Confirmar chegada" (com horário).
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Aviso, Entrada } from "@/components/ui";
import { normalizarTexto } from "@/lib/texto";
import { registrarChegada } from "./actions";

export interface Convidado {
  ingresso_id: string;
  nome: string;
  cpf_mascarado: string | null;
  area: string;
  anfitriao: string;
  titular: boolean;
  pedido_id: string;
  indicacao_de: string | null;
  chegada_em: string | null;
}

const hora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

export function ListaChegada({ convidados }: { convidados: Convidado[] }) {
  const router = useRouter();
  const [chegadas, setChegadas] = useState<Record<string, string | null>>(() => Object.fromEntries(convidados.map((c) => [c.ingresso_id, c.chegada_em])));
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  // dados do servidor (outra pessoa da operação pode ter confirmado alguém)
  useEffect(() => {
    setChegadas(Object.fromEntries(convidados.map((c) => [c.ingresso_id, c.chegada_em])));
  }, [convidados]);
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(t);
  }, [router]);

  const marcar = (c: Convidado, chegou: boolean) => {
    if (!chegou && !confirm(`Desfazer a chegada de ${c.nome}?`)) return;
    const antes = chegadas[c.ingresso_id];
    setChegadas((m) => ({ ...m, [c.ingresso_id]: chegou ? new Date().toISOString() : null }));
    iniciar(async () => {
      const r = await registrarChegada(c.ingresso_id, chegou);
      if (!r.ok) {
        setErro(r.erro);
        setChegadas((m) => ({ ...m, [c.ingresso_id]: antes }));
      } else {
        setErro(null);
        setChegadas((m) => ({ ...m, [c.ingresso_id]: r.dados?.em ?? null }));
      }
    });
  };

  const b = normalizarTexto(busca);
  const d = busca.replace(/\D/g, "");
  const visiveis = convidados.filter((c) => !b || normalizarTexto(c.nome).includes(b) || normalizarTexto(c.anfitriao).includes(b) || (d.length >= 3 && (c.cpf_mascarado ?? "").replace(/\D/g, "").includes(d)));
  const grupos = new Map<string, Convidado[]>();
  for (const c of visiveis) grupos.set(c.pedido_id, [...(grupos.get(c.pedido_id) ?? []), c]);
  const chegaram = convidados.filter((c) => chegadas[c.ingresso_id]).length;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 space-y-3 bg-fundo px-4 pt-1 pb-3">
        <div className="flex items-end justify-between rounded-2xl bg-mrv-700 px-4 py-3 text-white">
          <div>
            <div className="text-xs tracking-wide uppercase opacity-80">Chegaram</div>
            <div className="tabular text-3xl font-bold">{chegaram}<span className="text-lg opacity-70"> / {convidados.length}</span></div>
          </div>
          <div className="text-right text-xs opacity-80">{convidados.length - chegaram} ainda não chegaram</div>
        </div>
        <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, anfitrião ou CPF…" className="py-3 text-base" aria-label="Buscar convidado" />
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>

      {visiveis.length === 0 && <p className="py-8 text-center text-sm text-tinta/50">{convidados.length ? "Ninguém encontrado." : "Nenhum convidado aprovado para o camarote ainda."}</p>}

      {[...grupos.values()].map((g) => (
        <section key={g[0].pedido_id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
          <div className="border-b border-black/5 bg-mrv-50 px-4 py-2 text-xs">
            <span className="font-semibold text-mrv-900">Anfitrião: {g[0].anfitriao}</span>
            <span className="text-tinta/60"> · {g[0].area}{g[0].indicacao_de ? ` · indicação ${g[0].indicacao_de}` : ""}</span>
          </div>
          <ul className="divide-y divide-black/5">
            {g.map((c) => {
              const em = chegadas[c.ingresso_id];
              return (
                <li key={c.ingresso_id} className={clsx("flex items-center gap-3 px-4 py-3", em && "bg-mrv-50/50")}>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium break-words">{c.nome}</div>
                    <div className="text-xs text-tinta/60">
                      {c.titular ? "Anfitrião" : `Convidado de ${c.anfitriao}`} · <span className="font-mono">{c.cpf_mascarado}</span>
                    </div>
                  </div>
                  {em ? (
                    <button onClick={() => marcar(c, false)} disabled={pendente} className="shrink-0 rounded-xl bg-mrv-700 px-3 py-2 text-right text-white">
                      <div className="text-sm font-semibold">✓ Chegou</div>
                      <div className="tabular text-xs opacity-80">{hora(em)}</div>
                    </button>
                  ) : (
                    <button onClick={() => marcar(c, true)} disabled={pendente}
                      className="shrink-0 rounded-xl px-3 py-3 text-sm font-semibold text-mrv-700 ring-2 ring-mrv-700/40 active:bg-mrv-50">
                      Confirmar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
