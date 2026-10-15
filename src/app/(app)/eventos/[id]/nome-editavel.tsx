"use client";
import { useState, useTransition, type ReactNode } from "react";
import { Entrada, Selo } from "@/components/ui";
import type { Resultado } from "@/lib/erros";
import { SEM_NOME } from "@/lib/texto";

export const semNome = (nome: string | null) => !nome || nome === SEM_NOME;

type Dados = { nome: string; celular: string; email: string };

/**
 * Nome na lista. Para quem o Admin/Marketing adicionou ("+ Adicionar convidado"), dá para informar
 * ou corrigir nome e contato a qualquer momento — inclusive depois do envio.
 */
export function NomeEditavel({ linha, salvar, children }: {
  linha: { id: string; nome: string | null; celular: string | null; email: string | null; manual_admin?: boolean };
  salvar: (id: string, d: Dados) => Promise<Resultado>;
  /** Como o nome aparece normalmente (com tooltip, recuo etc.). */
  children: ReactNode;
}) {
  const [editando, setEditando] = useState(false);
  const [d, setD] = useState<Dados>({ nome: "", celular: "", email: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  if (editando) {
    return (
      <div className="flex min-w-72 flex-col gap-1.5 py-1">
        <Entrada autoFocus value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} placeholder="Nome completo" aria-label="Nome" />
        <div className="flex gap-1.5">
          <Entrada value={d.celular} onChange={(e) => setD({ ...d, celular: e.target.value })} placeholder="Celular (opcional)" inputMode="tel" aria-label="Celular" />
          <Entrada value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} placeholder="E-mail (opcional)" aria-label="E-mail" />
        </div>
        {erro && <span className="text-xs text-red-700">{erro}</span>}
        <div className="flex gap-2">
          <button disabled={salvando || !d.nome.trim()}
            onClick={() => iniciar(async () => { const r = await salvar(linha.id, d); if (r.ok) setEditando(false); else setErro(r.erro); })}
            className="rounded-lg bg-mrv-600 px-3 py-1 text-xs font-bold text-white hover:bg-mrv-700 disabled:opacity-50">{salvando ? "Salvando…" : "Salvar"}</button>
          <button onClick={() => setEditando(false)} className="text-xs text-cinza hover:underline">cancelar</button>
        </div>
      </div>
    );
  }
  const vazio = semNome(linha.nome);
  return (
    <span className="inline-flex items-center gap-1.5">
      {vazio ? <Selo tom="laranja">Nome a informar</Selo> : children}
      {linha.manual_admin && (
        <button title="Adicionado pela equipe: dá para informar ou corrigir o nome a qualquer momento"
          onClick={() => { setErro(null); setD({ nome: vazio ? "" : linha.nome ?? "", celular: linha.celular ?? "", email: linha.email ?? "" }); setEditando(true); }}
          className="rounded px-1.5 py-0.5 text-xs font-semibold text-mrv-700 hover:bg-mrv-100">
          {vazio ? "Informar nome" : "✎"}
        </button>
      )}
    </span>
  );
}
