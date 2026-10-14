"use client";

export function BotaoImprimir() {
  return (
    <button onClick={() => window.print()} className="rounded-lg bg-mrv-600 px-4 py-2 text-sm font-bold text-white print:hidden">
      Imprimir / salvar PDF
    </button>
  );
}
