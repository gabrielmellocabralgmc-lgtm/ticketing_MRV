// Componentes básicos no estilo shadcn/ui, com o tema MRV.
import clsx from "clsx";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { STATUS_INGRESSO, type StatusIngresso } from "@/lib/tipos";

type Variante = "primario" | "secundario" | "fantasma" | "perigo" | "laranja";
const VARIANTES: Record<Variante, string> = {
  primario: "bg-mrv-600 text-white hover:bg-mrv-700 disabled:bg-mrv-600/50",
  secundario: "bg-white text-mrv-700 ring-1 ring-mrv-600 hover:bg-mrv-50",
  fantasma: "text-mrv-700 hover:bg-mrv-50",
  perigo: "bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50",
  laranja: "bg-laranja-500 text-[#2b1600] hover:brightness-95",
};
const botaoBase =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mrv-600";

export function Botao({ variante = "primario", className, ...p }: ComponentProps<"button"> & { variante?: Variante }) {
  return <button className={clsx(botaoBase, VARIANTES[variante], className)} {...p} />;
}

export function BotaoLink({ variante = "secundario", className, ...p }: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={clsx(botaoBase, VARIANTES[variante], className)} {...p} />;
}

export function Cartao({ className, ...p }: ComponentProps<"section">) {
  return <section className={clsx("rounded-2xl border border-borda bg-white p-5", className)} {...p} />;
}

export function Titulo({ children, sub, acoes }: { children: ReactNode; sub?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] leading-tight font-bold text-tinta">{children}</h1>
        {sub && <p className="mt-1 text-[15px] text-cinza">{sub}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Campo({ rotulo, dica, erro, children, className }: { rotulo: string; dica?: ReactNode; erro?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block text-sm", className)}>
      <span className="mb-1 block font-medium text-tinta">{rotulo}</span>
      {children}
      {erro ? <span className="mt-1 block text-xs text-red-700">{erro}</span> : dica && <span className="mt-1 block text-xs text-tinta/60">{dica}</span>}
    </label>
  );
}

const inputBase =
  "w-full min-h-11 rounded-lg border-0 bg-white px-3 py-2 text-[15px] ring-1 ring-[#d1d1d1] placeholder:text-tinta/40 focus:ring-2 focus:ring-mrv-600 focus:outline-none disabled:bg-fundo";

export function Entrada({ className, ...p }: ComponentProps<"input">) {
  return <input className={clsx(inputBase, className)} {...p} />;
}

export function Selecao({ className, ...p }: ComponentProps<"select">) {
  return <select className={clsx(inputBase, "pr-8", className)} {...p} />;
}

export function AreaTexto({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={clsx(inputBase, className)} {...p} />;
}

const TONS = {
  cinza: "bg-[#edeeed] text-[#434645]",
  azul: "bg-[#e3eefa] text-[#1d4f86]",
  amarelo: "bg-amarelo-100 text-[#5c4a00]",
  verde: "bg-mrv-100 text-mrv-700",
  laranja: "bg-laranja-100 text-[#8a4b0f]",
  vermelho: "bg-red-100 text-red-800",
};

export function Selo({ tom = "cinza", children }: { tom?: keyof typeof TONS; children: ReactNode }) {
  return <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", TONS[tom])}>{children}</span>;
}

export function SeloStatus({ status }: { status: StatusIngresso }) {
  const s = STATUS_INGRESSO[status];
  return <Selo tom={s.tom}>{s.rotulo}</Selo>;
}

export function Tabela({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("-mx-5 overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] text-left text-sm [&_td]:px-5 [&_td]:py-3 [&_th]:bg-[#fafafa] [&_th]:px-5 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-cinza [&_th]:uppercase [&_tbody_tr]:border-t [&_tbody_tr]:border-[#edeeed]">
        {children}
      </table>
    </div>
  );
}

export function Numero({ rotulo, valor, de, tom = "mrv" }: { rotulo: string; valor: number | string; de?: number; tom?: "mrv" | "laranja" | "cinza" }) {
  return (
    <div className={clsx("rounded-2xl border p-4", tom === "laranja" ? "border-[#ffd9b3] bg-laranja-100" : "border-borda bg-white")}>
      <div className={clsx("text-[13px] font-semibold", tom === "laranja" ? "text-[#8a4b0f]" : "text-cinza")}>{rotulo}</div>
      <div className={clsx("tabular mt-1 font-display text-3xl font-bold", tom === "laranja" ? "text-laranja-700" : tom === "cinza" ? "text-[#434645]" : "text-mrv-700")}>
        {valor}
        {de !== undefined && <span className="text-base font-medium text-tinta/40"> / {de}</span>}
      </div>
    </div>
  );
}

export function Aviso({ tom = "info", children }: { tom?: "info" | "erro" | "ok" | "alerta"; children: ReactNode }) {
  const c = {
    info: "bg-sky-50 text-sky-900 ring-sky-200",
    erro: "bg-red-50 text-red-900 ring-red-200",
    ok: "bg-mrv-50 text-mrv-900 ring-mrv-100",
    alerta: "bg-laranja-100/60 text-orange-900 ring-orange-200",
  }[tom];
  return <div role={tom === "erro" ? "alert" : "status"} className={clsx("rounded-lg px-3.5 py-2.5 text-sm ring-1", c)}>{children}</div>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-tinta/50">{children}</p>;
}
