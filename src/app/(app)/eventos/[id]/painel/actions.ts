"use server";
import { revalidatePath } from "next/cache";
import { lerErro, type Resultado } from "@/lib/erros";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Setor } from "@/lib/tipos";

export interface ResultadoLinha {
  nome: string;
  ok: boolean;
  status?: string;
  erro?: string;
}

/**
 * Marketing cola nomes + CPFs. Cada linha vira um pedido (ou todos ficam como convidados do 1º,
 * ex.: anfitrião do camarote). Já entram aprovados; sem saldo, vão para a lista de espera.
 */
export async function adicionarNomes(
  evento: string, setor: Setor, area: string, pessoas: { nome: string; cpf: string }[], agrupar: boolean,
): Promise<Resultado<ResultadoLinha[]>> {
  await exigirStaff();
  if (!pessoas.length) return { ok: false, erro: "Cole pelo menos um nome com CPF." };
  const supabase = await supabaseServidor();
  const grupos = agrupar ? [pessoas] : pessoas.map((p) => [p]);
  const resultado: ResultadoLinha[] = [];
  for (const g of grupos) {
    const { data, error } = await supabase.rpc("criar_pedido", {
      p_evento: evento, p_setor: setor, p_area: area, p_pessoas: g,
      p_opcoes: { origem: "marketing", lista_espera: true },
    });
    const status = (data as { status?: string } | null)?.status;
    for (const p of g) resultado.push(error ? { nome: p.nome, ok: false, erro: lerErro(error).mensagem } : { nome: p.nome, ok: true, status });
    if (error && agrupar) break;
  }
  revalidatePath(`/eventos/${evento}`, "layout");
  const ok = resultado.filter((r) => r.ok).length;
  const espera = resultado.filter((r) => r.status === "lista_espera").length;
  return {
    ok: true, dados: resultado,
    mensagem: `${ok} de ${resultado.length} adicionado(s)${espera ? `, ${espera} na lista de espera (sem saldo)` : ""}.`,
  };
}
