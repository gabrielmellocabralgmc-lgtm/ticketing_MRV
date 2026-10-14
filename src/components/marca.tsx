import clsx from "clsx";
import { CHAVE_LOGO, CHAVE_LOGO_ESCURO, imagensDisponiveis } from "@/lib/imagens";

/**
 * Logo da MRV enviado em Aparência. Em fundo escuro usa a versão para fundo escuro; sem ela,
 * o logo normal vai num selo branco. Sem nenhum logo enviado, mostra o selo "MRV" em texto.
 */
export async function Marca({ className, claro, tamanho = "m" }: { className?: string; claro?: boolean; tamanho?: "m" | "g" }) {
  const img = await imagensDisponiveis();
  const altura = tamanho === "g" ? "h-10 max-w-[180px]" : "h-8 max-w-[132px]";
  const escuro = claro ? img[CHAVE_LOGO_ESCURO] : undefined;
  const normal = img[CHAVE_LOGO];
  if (escuro || normal) {
    const src = escuro ?? normal!;
    const img_ = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="MRV" className={clsx(altura, "w-auto object-contain", className)} />
    );
    // logo normal sobre fundo escuro: selo branco por trás para manter as cores da marca
    return claro && !escuro ? <span className="inline-flex rounded-lg bg-white px-2 py-1">{img_}</span> : img_;
  }
  return (
    <span className={clsx("rounded-md px-2 py-0.5 font-display font-extrabold", tamanho === "g" ? "text-lg" : "text-[15px]",
      claro ? "bg-white text-mrv-600" : "bg-mrv-600 text-white", className)}>
      MRV
    </span>
  );
}
