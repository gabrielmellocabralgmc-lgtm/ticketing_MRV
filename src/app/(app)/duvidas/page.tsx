import Link from "next/link";
import clsx from "clsx";
import { Titulo, Vazio } from "@/components/ui";
import { EMAIL_OPERACIONAL, todasDuvidas, type Status } from "@/lib/duvidas";
import { exigirAdmin } from "@/lib/sessao";
import { ListaDuvidas } from "./lista";

export const metadata = { title: "Dúvidas" };
export const dynamic = "force-dynamic";

const FILTROS: { id: Status | "todas"; rotulo: string }[] = [
  { id: "aguardando", rotulo: "Aguardando resposta" },
  { id: "respondida", rotulo: "Respondidas" },
  { id: "resolvida", rotulo: "Resolvidas" },
  { id: "todas", rotulo: "Todas" },
];

// Equipe de ingressos (Admin act.3): todas as dúvidas de gestores e convidados, com o contexto já preso.
export default async function Duvidas({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await exigirAdmin();
  const { ver } = await searchParams;
  const filtro = (FILTROS.some((f) => f.id === ver) ? ver : "aguardando") as Status | "todas";
  const [lista, todas] = await Promise.all([todasDuvidas(filtro === "todas" ? undefined : filtro), todasDuvidas()]);
  const conta = (s: Status) => todas.filter((d) => d.status === s).length;
  return (
    <>
      <Titulo sub={`Perguntas de gestores e convidados, já com o evento, a área e a pessoa. Cada nova mensagem também avisa ${EMAIL_OPERACIONAL()}.`}>Dúvidas</Titulo>
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filtrar dúvidas">
        {FILTROS.map((f) => (
          <Link key={f.id} href={`/duvidas?ver=${f.id}`} aria-current={filtro === f.id ? "page" : undefined}
            className={clsx("rounded-full px-4 py-2 text-sm font-semibold", filtro === f.id ? "bg-mrv-700 text-white" : "bg-white text-mrv-700 ring-1 ring-borda hover:bg-mrv-50")}>
            {f.rotulo}{f.id !== "todas" && ` (${conta(f.id)})`}
          </Link>
        ))}
      </nav>
      {lista.length === 0 ? <Vazio>{filtro === "aguardando" ? "Nenhuma dúvida esperando resposta." : "Nada por aqui."}</Vazio> : (
        <ListaDuvidas duvidas={lista.map((d) => ({
          id: d.id, evento_id: d.evento_id, evento_titulo: d.evento_titulo, area_id: d.area_id, area_nome: d.area_nome,
          autor_tipo: d.autor_tipo, autor_nome: d.autor_nome, autor_email: d.autor_email, status: d.status, atualizado_em: d.atualizado_em, mensagens: d.mensagens,
        }))} />
      )}
    </>
  );
}
