"use client";
// Espaço para enviar uma imagem (foto do login, escudos). Fotos grandes são reduzidas no
// navegador antes do envio, para o upload ficar leve.
import { useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { removerImagem, salvarImagem } from "@/app/img/actions";

async function prepararArquivo(f: File, maxLado: number): Promise<{ mime: string; base64: string }> {
  const lerBase64 = (b: Blob) =>
    new Promise<string>((ok, erro) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1] ?? "");
      r.onerror = erro;
      r.readAsDataURL(b);
    });
  if (f.type === "image/svg+xml") return { mime: f.type, base64: await lerBase64(f) };
  const bitmap = await createImageBitmap(f);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  if (escala === 1 && f.size < 1.5 * 1024 * 1024) return { mime: f.type, base64: await lerBase64(f) };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  // PNG mantém a transparência do escudo; foto vira JPEG
  const mime = f.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), mime, 0.85));
  return { mime, base64: await lerBase64(blob) };
}

export function EnviarImagem({
  chave, url, rotulo, dica, formato = "foto", escuro = false,
}: {
  chave: string;
  url?: string;
  rotulo: string;
  dica?: string;
  formato?: "foto" | "escudo";
  escuro?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<string | undefined>(url);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [arrastando, setArrastando] = useState(false);

  const enviar = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) return setErro("Use PNG, JPG, WEBP ou SVG.");
    setErro(null);
    iniciar(async () => {
      try {
        const { mime, base64 } = await prepararArquivo(f, formato === "foto" ? 1920 : 512);
        const r = await salvarImagem(chave, mime, base64);
        if (!r.ok) return setErro(r.erro);
        setPrevia(`data:${mime};base64,${base64}`);
      } catch {
        setErro("Não consegui ler essa imagem.");
      }
    });
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); enviar(e.dataTransfer.files[0]); }}
        disabled={pendente}
        aria-label={`${rotulo}: ${previa ? "trocar" : "enviar"} imagem`}
        className={clsx(
          "group relative flex w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition",
          formato === "foto" ? "aspect-video max-h-[420px]" : "aspect-[8/9] max-w-40",
          escuro ? "border-white/35 bg-preto text-white/75" : "border-[#c9ccca] bg-white text-cinza",
          arrastando && "border-mrv-600 bg-mrv-50",
        )}
      >
        {previa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previa} alt="" className={clsx("absolute inset-0 h-full w-full", formato === "foto" ? "object-cover" : "object-contain p-4")} />
        ) : (
          <span className="flex flex-col items-center gap-2 p-4 text-center text-sm">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {formato === "foto" ? <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></> : <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" />}
            </svg>
            <span className="font-semibold">{rotulo}</span>
            <span className="text-xs opacity-80">Arraste aqui ou clique para enviar</span>
          </span>
        )}
        {previa && (
          <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1.5 text-xs font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            {pendente ? "Enviando…" : "Trocar imagem"}
          </span>
        )}
        {pendente && !previa && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-semibold text-tinta">Enviando…</span>}
      </button>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => enviar(e.target.files?.[0])} />
      <div className="flex items-center justify-between gap-2 text-xs text-cinza">
        <span>{dica}</span>
        {previa && (
          <button type="button" className="font-semibold text-red-700 hover:underline" disabled={pendente}
            onClick={() => confirm("Remover esta imagem?") && iniciar(async () => { const r = await removerImagem(chave); if (r.ok) setPrevia(undefined); else setErro(r.erro); })}>
            Remover
          </button>
        )}
      </div>
      {erro && <p className="text-xs text-red-700">{erro}</p>}
    </div>
  );
}
