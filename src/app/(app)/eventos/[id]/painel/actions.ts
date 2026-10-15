"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { linkTorcedor } from "@/lib/mensagens";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { avisarAprovadosDoEvento } from "@/lib/mensagens/envio";

// ---------------------------------------------------------------- camarote (fase 2)

export interface PedidoCamaroteForm {
  area: string;
  prioridade: "exec_presidencia" | "diretor" | "gestor";
  anfitriao: { nome: string; cpf: string };
  convidados: { nome: string; cpf: string }[];
  indicacaoDe?: string;
  catering: "corporativo" | "pessoal";
  centroCusto?: string;
  observacao?: string;
}

const atualizar = (evento: string) => revalidatePath(`/eventos/${evento}`, "layout");

export async function criarPedidoCamarote(evento: string, f: PedidoCamaroteForm): Promise<Resultado<{ status: string }>> {
  await exigirStaff();
  if (f.catering === "corporativo" && !f.centroCusto?.trim()) return { ok: false, erro: "Informe o centro de custo para catering corporativo." };
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("criar_pedido", {
    p_evento: evento, p_setor: "camarote", p_area: f.area,
    p_pessoas: [{ ...f.anfitriao, colaborador: true }, ...f.convidados],
    p_opcoes: {
      origem: "marketing", lista_espera: true, prioridade: f.prioridade, catering: f.catering,
      centro_custo: f.catering === "corporativo" ? f.centroCusto : null, indicacao_de: f.indicacaoDe || null, observacao: f.observacao || null,
    },
  });
  if (error) return falha(error);
  atualizar(evento);
  const status = (data as { status: string }).status;
  if (status === "aprovado") await avisarAprovadosDoEvento(evento);
  return { ok: true, dados: { status }, mensagem: status === "lista_espera" ? "Pedido na fila. Distribua as vagas pela prioridade quando quiser." : "Pedido aprovado." };
}

export async function aprovarDaFila(evento: string, pedido: string): Promise<Resultado> {
  await exigirStaff();
  const { data, error } = await (await supabaseServidor()).rpc("aprovar_pedido_fila", { p_pedido: pedido });
  if (error) return falha(error);
  atualizar(evento);
  await avisarAprovadosDoEvento(evento);
  return { ok: true, mensagem: `${data} lugar(es) aprovado(s).` };
}

export async function distribuirCamarote(evento: string): Promise<Resultado> {
  await exigirStaff();
  const { data, error } = await (await supabaseServidor()).rpc("distribuir_camarote", { p_evento: evento });
  if (error) return falha(error);
  atualizar(evento);
  await avisarAprovadosDoEvento(evento);
  return { ok: true, mensagem: data ? `${data} lugar(es) distribuído(s) pela prioridade.` : "Nenhum pedido da fila cabe nas vagas livres." };
}

export async function atualizarPedido(evento: string, pedido: string, p: Record<string, string | null>): Promise<Resultado> {
  await exigirStaff();
  const { error } = await (await supabaseServidor()).rpc("atualizar_pedido", { p_pedido: pedido, p });
  if (error) return falha(error);
  atualizar(evento);
  return { ok: true, mensagem: "Pedido atualizado." };
}

export async function linkConvidadosAnfitriao(evento: string, anfitriao: string, qtd: number): Promise<Resultado<{ link: string }>> {
  await exigirStaff();
  const { data, error } = await (await supabaseServidor()).rpc("criar_convite_anfitriao", { p_anfitriao: anfitriao, p_qtd: qtd });
  if (error) return falha(error);
  atualizar(evento);
  return { ok: true, dados: { link: linkTorcedor((data as { token: string }).token) } };
}

export async function historicoPedido(pedido: string): Promise<{ em: string; quem: string; oque: string }[]> {
  await exigirStaff();
  const { data } = await (await supabaseServidor()).rpc("historico_pedido", { p_pedido: pedido });
  return (data ?? []) as { em: string; quem: string; oque: string }[];
}

export async function decidirWalkin(evento: string, walkin: string, aprovar: boolean): Promise<Resultado> {
  await exigirStaff();
  const { error } = await (await supabaseServidor()).rpc("decidir_walkin", { p_walkin: walkin, p_aprovar: aprovar });
  if (error) return falha(error);
  atualizar(evento);
  return { ok: true, mensagem: aprovar ? "Entrada aprovada: a pessoa já aparece como chegou." : "Entrada recusada." };
}

export async function encerrarEvento(evento: string): Promise<Resultado> {
  await exigirStaff();
  const { data, error } = await (await supabaseServidor()).rpc("encerrar_evento", { p_evento: evento });
  if (error) return falha(error);
  atualizar(evento);
  const r = data as { presentes: number; no_show: number };
  return { ok: true, mensagem: `Evento encerrado: ${r.presentes} presente(s) e ${r.no_show} no-show no camarote.` };
}
