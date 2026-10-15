"use client";
import { useRef, useState, useTransition } from "react";
import { dataHora } from "@/lib/formato";
import type { Foto } from "./dados";
import { enviarFoto, removerFoto } from "./actions";

const LADO_MAX = 1600;

/** Reduz a foto no próprio celular antes de enviar (~200–400 KB em vez de 3–5 MB). */
async function reduzir(arquivo: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
    return blob ?? arquivo;
  } catch {
    return arquivo; // formato que o navegador não abre (ex.: HEIC antigo): manda como veio
  }
}

/** Botão de câmera/galeria. Registra o horário em que a foto chegou ao sistema. */
export function EnviarFoto({ evento, momento, item, rotulo = "📷 Foto", desabilitado }: {
  evento: string; momento: "antes" | "depois" | "relatorio" | "bebidas_antes" | "bebidas_depois"; item?: string; rotulo?: string; desabilitado?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const escolher = (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    setErro(null);
    iniciar(async () => {
      for (const arquivo of Array.from(arquivos)) {
        const blob = await reduzir(arquivo);
        const f = new FormData();
        f.set("evento", evento);
        f.set("momento", momento);
        if (item) f.set("item", item);
        f.set("tirada_em", String(arquivo.lastModified || ""));
        f.set("arquivo", new File([blob], arquivo.name.replace(/\.\w+$/, "") + ".jpg", { type: blob.type || arquivo.type }));
        const r = await enviarFoto(f);
        if (!r.ok) { setErro(r.erro); break; }
      }
      if (input.current) input.current.value = "";
    });
  };

  return (
    <span className="inline-flex flex-col">
      <button type="button" disabled={enviando || desabilitado} onClick={() => input.current?.click()}
        className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-mrv-700 ring-1 ring-mrv-600/40 hover:bg-mrv-50 disabled:opacity-50">
        {enviando ? "Enviando…" : rotulo}
      </button>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => escolher(e.target.files)} />
      {erro && <span className="mt-1 text-xs text-red-700">{erro}</span>}
    </span>
  );
}

/** Miniaturas com o horário de envio. */
export function Galeria({ evento, fotos, podeRemover = true }: { evento: string; fotos: Foto[]; podeRemover?: boolean }) {
  const [pendente, iniciar] = useTransition();
  if (!fotos.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {fotos.map((f) => (
        <li key={f.id} className="w-28">
          <a href={`/operacao-camarote/foto/${f.id}`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg ring-1 ring-borda">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/operacao-camarote/foto/${f.id}`} alt={f.legenda ?? "Foto da operação"} loading="lazy" className="aspect-square w-full object-cover" />
          </a>
          <div className="mt-0.5 text-[11px] leading-tight text-cinza" title={f.tirada_em ? `Tirada em ${dataHora(f.tirada_em)}` : undefined}>
            enviada {dataHora(f.enviado_em)}
          </div>
          {podeRemover && (
            <button disabled={pendente} onClick={() => confirm("Remover esta foto?") && iniciar(async () => { await removerFoto(evento, f.id); })}
              className="text-[11px] text-red-700 hover:underline">remover</button>
          )}
        </li>
      ))}
    </ul>
  );
}
