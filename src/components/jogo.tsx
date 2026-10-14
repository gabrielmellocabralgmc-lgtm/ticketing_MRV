// Identidade do jogo: escudos e cabeçalho preto (Galo ID) usados nas telas de cada partida.
import clsx from "clsx";
import type { ReactNode } from "react";
import { dataLonga } from "@/lib/formato";

const TAMANHOS = { p: "h-[50px] w-11", m: "h-[72px] w-16", g: "h-[108px] w-24" };

/** Escudo enviado pelo Admin, ou o espaço vazio no formato de escudo. */
export function Escudo({ url, nome, tamanho = "m", escuro = true }: { url?: string; nome: string; tamanho?: keyof typeof TAMANHOS; escuro?: boolean }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={`Escudo ${nome}`} className={clsx(TAMANHOS[tamanho], "shrink-0 object-contain")} />;
  }
  return (
    <div role="img" aria-label={`Escudo ${nome} (não enviado)`}
      className={clsx(TAMANHOS[tamanho], "flex shrink-0 items-center justify-center rounded-[10px] border-2 border-dashed",
        escuro ? "border-white/35 text-white/70" : "border-[#c9ccca] text-[#8a8f8c]")}>
      <svg width={tamanho === "g" ? 28 : 20} height={tamanho === "g" ? 28 : 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z" />
      </svg>
    </div>
  );
}

/** Listras preto e branco do Galo, como detalhe sob o cabeçalho. */
export function Listras({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={clsx("grid h-1.5 grid-cols-12", className)}>
      {Array.from({ length: 12 }, (_, i) => <div key={i} className={i % 2 ? "" : "bg-white"} />)}
    </div>
  );
}

export interface DadosJogo {
  titulo: string;
  adversario: string | null;
  competicao: string | null;
  inicio: string;
  abertura_portoes?: string | null;
}

/** Faixa preta com os escudos, o nome da partida e a data. */
export function CabecalhoJogo({
  ev, escudoAtletico, escudoAdversario, tamanho = "g", rotulo, direita, children,
}: {
  ev: DadosJogo;
  escudoAtletico?: string;
  escudoAdversario?: string;
  tamanho?: "m" | "g";
  rotulo?: ReactNode;
  direita?: ReactNode;
  children?: ReactNode;
}) {
  const grande = tamanho === "g";
  return (
    // ocupa a largura toda da tela, mesmo dentro do <main> com largura máxima
    <section className="relative left-1/2 -mt-8 mb-8 w-screen -translate-x-1/2 bg-preto text-white">
      <div className={clsx("mx-auto flex max-w-7xl flex-wrap items-center px-4", grande ? "gap-6 py-8" : "gap-4 py-5")}>
        <Escudo url={escudoAtletico} nome="do Atlético" tamanho={grande ? "g" : "m"} />
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-1.5">
          <div className="font-display text-[13px] font-bold tracking-[0.1em] text-amarelo-500 uppercase">
            {rotulo ?? [ev.competicao, "Arena MRV"].filter(Boolean).join(" · ")}
          </div>
          <h1 className={clsx("font-display leading-none font-extrabold uppercase", grande ? "text-4xl sm:text-5xl" : "text-3xl")}>{ev.titulo}</h1>
          <div className="text-[15px] text-white/80 first-letter:uppercase">
            {dataLonga(ev.inicio)}{ev.abertura_portoes ? ` · portões ${dataLonga(ev.abertura_portoes).split(" às ")[1] ?? ""}` : ""}
          </div>
          {children}
        </div>
        {direita}
        <Escudo url={escudoAdversario} nome={ev.adversario ? `do ${ev.adversario}` : "do adversário"} tamanho={grande ? "g" : "m"} />
      </div>
      <Listras />
    </section>
  );
}
