import Link from "next/link";
import { exigirSessao } from "@/lib/sessao";
import { ROTULO_PAPEL } from "@/lib/tipos";
import { sair } from "./actions";

export default async function LayoutInterno({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  const links = [
    { href: "/eventos", rotulo: "Eventos" },
    ...(s.staff ? [{ href: "/admin/areas", rotulo: "Áreas e responsáveis" }] : []),
    ...(s.papel === "admin"
      ? [
          { href: "/admin/usuarios", rotulo: "Usuários" },
          { href: "/admin/importar", rotulo: "Importar" },
          { href: "/admin/auditoria", rotulo: "Auditoria" },
        ]
      : []),
  ];
  return (
    <div className="min-h-dvh">
      <header className="bg-mrv-700 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/eventos" className="flex items-center gap-2 font-bold">
            <span className="rounded-md bg-white px-1.5 py-0.5 text-xs font-black text-mrv-700">MRV</span>
            Ingressos · Arena MRV
          </Link>
          <nav className="flex gap-1 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-md px-2.5 py-1 text-white/85 hover:bg-white/10 hover:text-white">
                {l.rotulo}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-white/80">
              {s.nome} · <span className="text-amarelo-500">{ROTULO_PAPEL[s.papel]}</span>
            </span>
            <form action={sair}>
              <button className="rounded-md px-2 py-1 text-white/80 hover:bg-white/10 hover:text-white">Sair</button>
            </form>
          </div>
        </div>
        <div className="h-1 bg-laranja-500" />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
