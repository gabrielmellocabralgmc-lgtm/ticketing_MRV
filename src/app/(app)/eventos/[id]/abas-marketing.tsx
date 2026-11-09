import Link from "next/link";
import clsx from "clsx";

/** Marketing MRV: só duas abas por evento — os ingressos da área dele e a consulta de todas as áreas. */
export function AbasMarketing({ evento, atual, area }: { evento: string; atual: "marketing" | "todas"; area?: string }) {
  const abas = [
    { id: "marketing", rotulo: "Ingressos do Marketing", href: area ? `/eventos/${evento}/areas/${area}` : `/eventos/${evento}` },
    { id: "todas", rotulo: "Todas as áreas", href: `/eventos/${evento}/todas` },
  ];
  return (
    <nav aria-label="Abas do evento" className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-white p-1.5 ring-1 ring-borda sm:inline-grid sm:min-w-[440px]">
      {abas.map((a) => (
        <Link key={a.id} href={a.href} aria-current={atual === a.id ? "page" : undefined}
          className={clsx("rounded-xl px-4 py-3 text-center text-[15px] font-bold transition",
            atual === a.id ? "bg-mrv-700 text-white" : "text-mrv-900 hover:bg-mrv-50")}>
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}
