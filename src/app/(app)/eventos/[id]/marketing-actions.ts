"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Setor } from "@/lib/tipos";

async function lote(evento: string, fn: string, args: Record<string, unknown>, msg: (n: number) => string): Promise<Resultado> {
  await exigirStaff();
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return falha(error);
  revalidatePath(`/eventos/${evento}`, "layout");
  return { ok: true, mensagem: msg(Number(data ?? 0)) };
}

export const aprovar = async (evento: string, ids: string[]) =>
  lote(evento, "aprovar_ingressos", { p_ids: ids }, (n) => `${n} aprovado(s). Agora envie o passo a passo do Galo ID.`);

export const recusar = async (evento: string, ids: string[], motivo: string) =>
  lote(evento, "recusar_ingressos", { p_ids: ids, p_motivo: motivo }, (n) => `${n} recusado(s).`);

export const promover = async (evento: string, setor: Setor, area: string) =>
  lote(evento, "promover_lista_espera", { p_evento: evento, p_setor: setor, p_area: area }, (n) => n ? `${n} promovido(s) da lista de espera.` : "Sem saldo na área para promover — remaneje a cota primeiro.");

export const validarComoMarketing = async (evento: string, setor: Setor, area: string) =>
  lote(evento, "validar_lista", { p_evento: evento, p_setor: setor, p_area: area }, (n) => `${n} validado(s) em nome da área.`);

export const orientacaoEnviada = async (evento: string, ids: string[]) =>
  lote(evento, "marcar_orientacao_enviada", { p_ids: ids }, (n) => `${n} marcado(s) como "passo a passo enviado".`);

export const facialOk = async (evento: string, ids: string[]) =>
  lote(evento, "marcar_facial_ok", { p_ids: ids }, (n) => `${n} com facial confirmada.`);

export const enviados = async (evento: string, ids: string[]) =>
  lote(evento, "marcar_enviados", { p_ids: ids, p_forcar: false }, (n) => `${n} marcado(s) como enviado(s).`);

/** Envia mesmo sem a facial confirmada (fica registrado no histórico). */
export const enviadosSemFacial = async (evento: string, ids: string[]) =>
  lote(evento, "marcar_enviados", { p_ids: ids, p_forcar: true }, (n) => `${n} marcado(s) como enviado(s) sem confirmação da facial.`);

export const desfazerEnvio = async (evento: string, ids: string[]) =>
  lote(evento, "desfazer_envio", { p_ids: ids }, (n) => `${n} envio(s) desfeito(s).`);

export const cancelarMarketing = async (evento: string, ids: string[], motivo: string) =>
  lote(evento, "cancelar_ingressos", { p_ids: ids, p_motivo: motivo }, (n) => `${n} cancelado(s); a lista de espera foi chamada.`);

export async function registrarCopia(evento: string, tipo: "cpfs" | "nome_cpf", qtd: number) {
  await exigirStaff();
  const supabase = await supabaseServidor();
  await supabase.rpc("registrar_auditoria", { p_acao: "copiar_cpfs", p_entidade: "evento", p_entidade_id: evento, p_detalhes: { tipo, qtd } });
}
