"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function Nav({ links }: { links: { href: string; rotulo: string }[] }) {
  const atual = usePathname();
  return (
    <nav className="flex flex-wrap gap-1">
      {links.map((l) => {
        const ativo = atual === l.href || atual.startsWith(`${l.href}/`);
        return (
          <Link key={l.href} href={l.href} aria-current={ativo ? "page" : undefined}
            className={clsx("rounded-lg px-3 py-2 text-[15px] font-semibold", ativo ? "bg-mrv-50 text-mrv-700" : "text-cinza hover:bg-fundo hover:text-tinta")}>
            {l.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
