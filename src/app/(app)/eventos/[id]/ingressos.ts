import "server-only";
import { supabaseServidor } from "@/lib/supabase/server";
import type { StatusIngresso } from "@/lib/tipos";
import type { LinhaIngresso } from "./tabela-selecao";

/** Ingressos do evento com dados pessoais (só Admin/Marketing — RLS de pessoas). Registra a visualização na auditoria. */
export async function carregarIngressos(evento: string, status: StatusIngresso[], tela: string) {
  const supabase = await supabaseServidor();
  const { data, error } = await supabase
    .from("v_ingressos")
    .select("id, setor, area_id, area_nome, area_ordem, status, nome, cpf, celular, email, token, convidado_de, convidado_de_nome, indicacao_de, preenchido_por, enviado_em, facial_em, criado_em, pedido_id")
    .eq("evento_id", evento)
    .in("status", status)
    .order("setor").order("area_ordem").order("pedido_id").order("criado_em");
  if (error) throw new Error(`Erro ao carregar ingressos: ${error.message}`);
  await supabase.rpc("registrar_auditoria", { p_acao: "ver", p_entidade: "evento", p_entidade_id: evento, p_detalhes: { tela, qtd: data?.length ?? 0 } });
  // titular antes dos convidados dentro do pedido
  return ((data ?? []) as (LinhaIngresso & { pedido_id: string })[]).sort((a, b) =>
    a.pedido_id === b.pedido_id ? Number(!!a.convidado_de) - Number(!!b.convidado_de) : 0);
}
