import Link from "next/link";
import { exigirSessao } from "@/lib/sessao";
import { ROTULO_PAPEL } from "@/lib/tipos";
import { Marca } from "@/components/marca";
import { Nav } from "@/components/nav";
import { sair } from "./actions";

export default async function LayoutInterno({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  // Cada perfil vê só o que usa
  const links =
    s.papel === "operacao" ? [{ href: "/operacao", rotulo: "Camarote" }]
      : s.papel === "admin"
        ? [
            { href: "/eventos", rotulo: "Eventos" },
            { href: "/admin/areas", rotulo: "Áreas e responsáveis" },
            { href: "/admin/aparencia", rotulo: "Aparência" },
            { href: "/admin/usuarios", rotulo: "Usuários" },
            { href: "/admin/importar", rotulo: "Importar" },
            { href: "/admin/auditoria", rotulo: "Auditoria" },
          ]
        : [{ href: "/eventos", rotulo: "Jogos" }];
  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="border-b border-borda bg-white">
        <div className="mx-auto flex min-h-[72px] max-w-7xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-2">
          <Link href={s.papel === "operacao" ? "/operacao" : "/eventos"} className="flex items-center gap-2.5">
            <Marca />
            <span className="text-base font-bold text-tinta">Ingressos · Arena MRV</span>
          </Link>
          <Nav links={links} />
          <div className="ml-auto flex items-center gap-4 text-sm text-cinza">
            <span>
              {s.nome} · <span className="font-semibold text-mrv-700">{ROTULO_PAPEL[s.papel]}</span>
            </span>
            <form action={sair}>
              <button className="rounded-lg px-2 py-2 font-semibold text-mrv-700 hover:bg-mrv-50">Sair</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
