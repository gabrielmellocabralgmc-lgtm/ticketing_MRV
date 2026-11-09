import Link from "next/link";
import { contarAguardando } from "@/lib/duvidas";
import { exigirSessao } from "@/lib/sessao";
import { ROTULO_PAPEL } from "@/lib/tipos";
import { Marca } from "@/components/marca";
import { Nav } from "@/components/nav";
import { sair } from "./actions";
import { MODO_DEMO } from "@/lib/demo/constantes";

export default async function LayoutInterno({ children }: { children: React.ReactNode }) {
  const s = await exigirSessao();
  const duvidasAbertas = s.papel === "admin" ? await contarAguardando() : 0;
  // Cada perfil vê só o que usa
  const links =
    s.papel === "operacao"
      ? [{ href: "/operacao", rotulo: "Lista do camarote" }, { href: "/operacao-camarote", rotulo: "Operação camarote" }]
      : s.papel === "admin"
        ? [
            { href: "/dashboard", rotulo: "Dashboard" },
            { href: "/eventos", rotulo: "Eventos" },
            { href: "/duvidas", rotulo: duvidasAbertas ? `Dúvidas (${duvidasAbertas})` : "Dúvidas" },
            { href: "/operacao-camarote", rotulo: "Operação camarote" },
            { href: "/admin", rotulo: "Configurações" },
          ]
        : [{ href: "/eventos", rotulo: "Eventos" }];
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
            {!MODO_DEMO && <Link href="/conta/senha" className="rounded-lg px-2 py-2 font-semibold text-mrv-700 hover:bg-mrv-50">Minha senha</Link>}
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
