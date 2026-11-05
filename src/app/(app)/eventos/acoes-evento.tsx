"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { excluirEvento } from "./actions";

/** Editar / Excluir na lista de eventos (Admin). Excluir pede para digitar o nome do evento. */
export function AcoesEvento({ id, titulo }: { id: string; titulo: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const excluir = () => {
    const digitado = prompt(
      `Excluir “${titulo}”?\n\nTodos os convidados, ingressos, links, PDFs, fotos e relatórios deste evento serão apagados. Não dá para desfazer.\n\nPara confirmar, digite o nome do evento:`,
    );
    if (digitado === null) return;
    if (digitado.trim().toLowerCase() !== titulo.trim().toLowerCase()) {
      setErro("O nome digitado não confere. Nada foi excluído.");
      return;
    }
    iniciar(async () => {
      const r = await excluirEvento(id);
      setErro(r.ok ? null : r.erro);
    });
  };
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-borda px-5 py-2.5">
      {erro && <span className="mr-auto text-xs text-red-700">{erro}</span>}
      <Link href={`/eventos/${id}/editar`} className="rounded-md px-2.5 py-1 text-xs font-semibold text-mrv-700 ring-1 ring-mrv-600/40 hover:bg-mrv-50">Editar</Link>
      <button type="button" onClick={excluir} disabled={pendente}
        className="rounded-md px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:opacity-50">
        {pendente ? "Excluindo…" : "Excluir"}
      </button>
    </div>
  );
}
