"use client";
import { useState } from "react";
import clsx from "clsx";

export function BotaoCopiar({ texto, rotulo = "Copiar", className, aoCopiar }: { texto: string; rotulo?: string; className?: string; aoCopiar?: () => void }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-mrv-700 ring-1 ring-mrv-700/25 hover:bg-mrv-50", className)}
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setOk(true);
        aoCopiar?.();
        setTimeout(() => setOk(false), 1500);
      }}
    >
      {ok ? "Copiado ✓" : rotulo}
    </button>
  );
}

export function BotaoWhatsApp({ link, rotulo = "WhatsApp", aoAbrir }: { link: string; rotulo?: string; aoAbrir?: () => void }) {
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={aoAbrir}
      className="inline-flex items-center gap-1 rounded-md bg-[#25D366]/15 px-2 py-1 text-xs font-semibold text-[#0d7a3a] hover:bg-[#25D366]/25"
    >
      {rotulo}
    </a>
  );
}
