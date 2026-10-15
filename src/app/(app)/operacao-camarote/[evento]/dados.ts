import "server-only";
import { supabaseServidor } from "@/lib/supabase/server";

export type Momento = "antes" | "depois";
export type StatusItem = "ok" | "problema" | "na";

export interface ItemChecklist { id: string; momento: Momento; secao: string; texto: string; dica: string | null; ordem: number }
export interface Resposta { item_id: string; status: StatusItem; observacao: string | null; respondido_em: string }
export interface Foto { id: string; momento: string | null; item_id: string | null; legenda: string | null; enviado_em: string; tirada_em: string | null }
export interface LinhaBebida {
  bebida_id: string; nome: string; unidade: string; sobra_anterior: number | null; jogo_anterior: string | null;
  contratado: number | null; contagem_inicial: number | null; contagem_final: number | null;
}
export interface Relatorio {
  abertura_camarote: string | null; encerramento_camarote: string | null; avaliacao: number | null;
  resumo: string | null; ocorrencias: string | null; manutencao: string | null; feedback: string | null;
  finalizado_em: string | null;
}

/** Tudo da operação do camarote de um jogo (check-lists, bebidas, relatório, fotos e presença). */
export async function carregarOperacao(evento: string) {
  const sb = await supabaseServidor();
  const [itens, respostas, checklists, bebidas, relatorio, fotos, convidados] = await Promise.all([
    sb.from("op_itens").select("id, momento, secao, texto, dica, ordem, ativo").order("ordem"),
    sb.from("op_respostas").select("item_id, status, observacao, respondido_em").eq("evento_id", evento),
    sb.from("op_checklists").select("momento, concluido_em").eq("evento_id", evento),
    sb.rpc("op_bebidas_do_jogo", { p_evento: evento }),
    sb.from("op_relatorios").select("abertura_camarote, encerramento_camarote, avaliacao, resumo, ocorrencias, manutencao, feedback, finalizado_em").eq("evento_id", evento).maybeSingle(),
    sb.from("op_fotos").select("id, momento, item_id, legenda, enviado_em, tirada_em").eq("evento_id", evento).order("enviado_em"),
    sb.rpc("lista_camarote", { p_evento: evento }),
  ]);
  const concluido = Object.fromEntries(((checklists.data ?? []) as { momento: Momento; concluido_em: string | null }[]).map((c) => [c.momento, c.concluido_em]));
  const lista = (convidados.data ?? []) as { chegada_em: string | null }[];
  return {
    // itens desativados continuam aparecendo nos jogos em que já foram respondidos (histórico)
    itens: ((itens.data ?? []) as (ItemChecklist & { ativo: boolean })[])
      .filter((i) => i.ativo || (respostas.data ?? []).some((r) => r.item_id === i.id)),
    respostas: (respostas.data ?? []) as Resposta[],
    concluido: { antes: (concluido.antes ?? null) as string | null, depois: (concluido.depois ?? null) as string | null },
    bebidas: (bebidas.data ?? []) as LinhaBebida[],
    relatorio: (relatorio.data ?? null) as Relatorio | null,
    fotos: (fotos.data ?? []) as Foto[],
    presenca: { convidados: lista.length, chegaram: lista.filter((c) => c.chegada_em).length },
  };
}

export type DadosOperacao = Awaited<ReturnType<typeof carregarOperacao>>;
