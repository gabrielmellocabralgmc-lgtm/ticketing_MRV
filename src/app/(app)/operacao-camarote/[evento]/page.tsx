import Link from "next/link";
import clsx from "clsx";
import { CabecalhoJogo } from "@/components/jogo";
import { Numero } from "@/components/ui";
import { CHAVE_ESCUDO_ATLETICO, chaveEscudoAdversario, imagensDisponiveis } from "@/lib/imagens";
import { carregarEvento } from "../../eventos/[id]/dados";
import { exigirOperacao } from "../acesso";
import { Bebidas } from "./bebidas";
import { Checklist } from "./checklist";
import { carregarOperacao } from "./dados";
import { RelatorioJogo } from "./relatorio";

export const metadata = { title: "Operação camarote" };

const ABAS = [
  { id: "antes", rotulo: "Antes do jogo" },
  { id: "bebidas", rotulo: "Bebidas" },
  { id: "depois", rotulo: "Depois do jogo" },
  { id: "relatorio", rotulo: "Relatório" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export default async function OperacaoJogo({ params, searchParams }: { params: Promise<{ evento: string }>; searchParams: Promise<{ aba?: string }> }) {
  await exigirOperacao();
  const [{ evento }, { aba: abaParam }] = await Promise.all([params, searchParams]);
  const [ev, op, img] = await Promise.all([carregarEvento(evento), carregarOperacao(evento), imagensDisponiveis()]);
  const aba: Aba = ABAS.some((a) => a.id === abaParam) ? (abaParam as Aba) : !op.concluido.antes ? "antes" : !op.concluido.depois ? "depois" : "relatorio";

  const respondidos = (m: "antes" | "depois") => {
    const ids = new Set(op.itens.filter((i) => i.momento === m).map((i) => i.id));
    return { total: ids.size, feitos: op.respostas.filter((r) => ids.has(r.item_id)).length };
  };
  const estado: Record<Aba, string> = {
    antes: op.concluido.antes ? "✓" : `${respondidos("antes").feitos}/${respondidos("antes").total}`,
    bebidas: op.bebidas.some((b) => b.contagem_final !== null) ? "✓" : op.bebidas.some((b) => b.contagem_inicial !== null) ? "½" : "",
    depois: op.concluido.depois ? "✓" : `${respondidos("depois").feitos}/${respondidos("depois").total}`,
    relatorio: op.relatorio?.finalizado_em ? "✓" : op.relatorio ? "rascunho" : "",
  };
  const faltaContagem = (campo: "contagem_inicial" | "contagem_final") => op.bebidas.filter((b) => b[campo] === null).length;
  const problemas = op.respostas.filter((r) => r.status === "problema").length;

  return (
    <>
      <CabecalhoJogo ev={ev} tamanho="m" rotulo="Operação do camarote" escudoAtletico={img[CHAVE_ESCUDO_ATLETICO]} escudoAdversario={img[chaveEscudoAdversario(ev.id)]}
        voltar={{ href: "/operacao-camarote", rotulo: "Jogos" }} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Convidados na lista" valor={op.presenca.convidados} />
        <Numero rotulo="Chegaram" valor={op.presenca.chegaram} de={op.presenca.convidados || undefined} tom="cinza" />
        <Numero rotulo="Itens com problema" valor={problemas} tom={problemas ? "laranja" : "cinza"} />
        <Numero rotulo="Fotos" valor={op.fotos.length} tom="cinza" />
      </div>

      <nav className="mb-5 flex flex-wrap gap-1.5" aria-label="Etapas da operação">
        {ABAS.map((a) => (
          <Link key={a.id} href={`?aba=${a.id}`} aria-current={a.id === aba ? "page" : undefined}
            className={clsx("rounded-full px-4 py-2 text-sm font-semibold", a.id === aba ? "bg-mrv-700 text-white" : "bg-white text-mrv-700 ring-1 ring-borda hover:bg-mrv-50")}>
            {a.rotulo} {estado[a.id] && <span className={clsx("ml-1 tabular", a.id === aba ? "text-white/80" : "text-cinza")}>{estado[a.id]}</span>}
          </Link>
        ))}
        <Link href={`/operacao-camarote/${evento}/imprimir`} target="_blank" className="ml-auto rounded-full px-4 py-2 text-sm font-semibold text-mrv-700 hover:bg-mrv-50">
          Relatório completo (PDF) ↗
        </Link>
      </nav>

      {aba === "antes" && (
        <Checklist evento={evento} momento="antes" itens={op.itens.filter((i) => i.momento === "antes")} respostas={op.respostas}
          fotos={op.fotos.filter((f) => f.momento === "antes")} concluidoEm={op.concluido.antes}
          avisoBebidas={faltaContagem("contagem_inicial") ? `Falta a contagem de ${faltaContagem("contagem_inicial")} bebida(s) na aba Bebidas — é preciso para concluir.` : null} />
      )}
      {aba === "bebidas" && <Bebidas evento={evento} linhas={op.bebidas} travadoAntes={!!op.concluido.antes} travadoDepois={!!op.concluido.depois} />}
      {aba === "depois" && (
        <Checklist evento={evento} momento="depois" itens={op.itens.filter((i) => i.momento === "depois")} respostas={op.respostas}
          fotos={op.fotos.filter((f) => f.momento === "depois")} concluidoEm={op.concluido.depois}
          avisoBebidas={faltaContagem("contagem_final") ? `Falta a contagem final de ${faltaContagem("contagem_final")} bebida(s) na aba Bebidas — é preciso para concluir.` : null} />
      )}
      {aba === "relatorio" && <RelatorioJogo evento={evento} inicial={op.relatorio} fotos={op.fotos.filter((f) => f.momento === "relatorio")} />}
    </>
  );
}
