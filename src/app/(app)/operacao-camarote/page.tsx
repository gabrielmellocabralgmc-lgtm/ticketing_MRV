import Link from "next/link";
import { Selo, Titulo, Vazio } from "@/components/ui";
import { dataLonga } from "@/lib/formato";
import { supabaseServidor } from "@/lib/supabase/server";
import { exigirOperacao } from "./acesso";

export const metadata = { title: "Operação camarote" };

export default async function OperacaoCamarote() {
  await exigirOperacao();
  const sb = await supabaseServidor();
  const [{ data: eventos }, { data: checklists }, { data: relatorios }] = await Promise.all([
    sb.from("eventos").select("id, titulo, competicao, inicio, status").neq("status", "rascunho").order("inicio", { ascending: false }).limit(40),
    sb.from("op_checklists").select("evento_id, momento, concluido_em"),
    sb.from("op_relatorios").select("evento_id, finalizado_em"),
  ]);
  const feito = (ev: string, m: string) => (checklists ?? []).some((c) => c.evento_id === ev && c.momento === m && c.concluido_em);
  const rel = (ev: string) => (relatorios ?? []).find((r) => r.evento_id === ev);
  const agora = Date.now();
  // próximos (do mais perto para o mais longe) e depois os já realizados
  const lista = [...(eventos ?? [])].sort((a, b) => {
    const fa = new Date(a.inicio).getTime() >= agora - 12 * 3600e3, fb = new Date(b.inicio).getTime() >= agora - 12 * 3600e3;
    if (fa !== fb) return fa ? -1 : 1;
    return fa ? a.inicio.localeCompare(b.inicio) : b.inicio.localeCompare(a.inicio);
  });

  return (
    <>
      <Titulo sub="Check-list antes e depois de cada jogo, controle de bebidas, relatório e fotos de comprovação.">Operação do camarote</Titulo>
      {lista.length === 0 ? <Vazio>Nenhum jogo cadastrado.</Vazio> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lista.map((e) => {
            const r = rel(e.id);
            const passado = new Date(e.inicio).getTime() < agora - 12 * 3600e3;
            return (
              <li key={e.id}>
                <Link href={`/operacao-camarote/${e.id}`} className="block rounded-2xl border border-borda bg-white p-4 transition hover:border-mrv-600">
                  <div className="text-xs font-semibold tracking-wide text-cinza uppercase">{e.competicao ?? (passado ? "Realizado" : "Próximo")}</div>
                  <div className="text-lg font-bold">{e.titulo}</div>
                  <div className="text-sm text-cinza first-letter:uppercase">{dataLonga(e.inicio)}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Selo tom={feito(e.id, "antes") ? "verde" : "cinza"}>{feito(e.id, "antes") ? "✓ " : ""}Antes do jogo</Selo>
                    <Selo tom={feito(e.id, "depois") ? "verde" : "cinza"}>{feito(e.id, "depois") ? "✓ " : ""}Depois do jogo</Selo>
                    <Selo tom={r?.finalizado_em ? "verde" : r ? "amarelo" : passado ? "laranja" : "cinza"}>
                      {r?.finalizado_em ? "✓ Relatório" : r ? "Relatório em rascunho" : passado ? "Relatório pendente" : "Relatório"}
                    </Selo>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
