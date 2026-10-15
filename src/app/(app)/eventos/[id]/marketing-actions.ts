"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Setor } from "@/lib/tipos";
import { avisarAprovados, avisarEnviados, avisarPendenteFacial, resumoEnvio } from "@/lib/mensagens/envio";

async function lote(evento: string, fn: string, args: Record<string, unknown>, msg: (n: number) => string): Promise<Resultado> {
  await exigirStaff();
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return falha(error);
  revalidatePath(`/eventos/${evento}`, "layout");
  return { ok: true, mensagem: msg(Number(data ?? 0)) };
}

export async function aprovar(evento: string, ids: string[]): Promise<Resultado> {
  const r = await lote(evento, "aprovar_ingressos", { p_ids: ids }, (n) => `${n} aprovado(s).`);
  if (!r.ok) return r;
  const s = await exigirStaff();
  const e = await avisarAprovados(ids, s.userId);
  const total = e.enviados + e.simulados;
  return { ok: true, mensagem: `${r.mensagem} ${total ? `Passo a passo do Galo ID por e-mail: ${resumoEnvio(e)}.` : ""} Quem não tem e-mail: use o botão “Galo ID” (WhatsApp).` };
}

export const recusar = async (evento: string, ids: string[], motivo: string) =>
  lote(evento, "recusar_ingressos", { p_ids: ids, p_motivo: motivo }, (n) => `${n} recusado(s).`);

export const promover = async (evento: string, setor: Setor, area: string) =>
  lote(evento, "promover_lista_espera", { p_evento: evento, p_setor: setor, p_area: area }, (n) => n ? `${n} promovido(s) da lista de espera.` : "Sem saldo na área para promover — remaneje a cota primeiro.");

export const validarComoMarketing = async (evento: string, setor: Setor, area: string) =>
  lote(evento, "validar_lista", { p_evento: evento, p_setor: setor, p_area: area }, (n) => `${n} validado(s) em nome da área.`);

export const orientacaoEnviada = async (evento: string, ids: string[]) =>
  lote(evento, "marcar_orientacao_enviada", { p_ids: ids }, (n) => `${n} marcado(s) como "passo a passo enviado".`);

export const facialOk = async (evento: string, ids: string[]) =>
  lote(evento, "marcar_facial_ok", { p_ids: ids }, (n) => `${n} liberado(s): pronto para envio.`);

/** No sistema do Atlético a facial não está cadastrada: sinaliza e manda o passo a passo. */
export async function pendenteFacial(evento: string, ids: string[]): Promise<Resultado> {
  const r = await lote(evento, "marcar_facial_pendente", { p_ids: ids }, (n) => `${n} marcado(s) como pendente facial.`);
  if (!r.ok) return r;
  const s = await exigirStaff();
  const e = await avisarPendenteFacial(ids, s.userId);
  return { ok: true, mensagem: `${r.mensagem} ${e.enviados + e.simulados ? `Passo a passo por e-mail: ${resumoEnvio(e)}.` : "Sem e-mail cadastrado: mande o passo a passo pelo WhatsApp."}` };
}

async function comAvisoDeEnvio(r: Resultado, ids: string[]): Promise<Resultado> {
  if (!r.ok) return r;
  const s = await exigirStaff();
  const e = await avisarEnviados(ids, s.userId);
  return e.enviados + e.simulados ? { ok: true, mensagem: `${r.mensagem} Aviso por e-mail: ${resumoEnvio(e)}.` } : r;
}

export const enviados = async (evento: string, ids: string[]) =>
  comAvisoDeEnvio(await lote(evento, "marcar_enviados", { p_ids: ids, p_forcar: false }, (n) => `${n} marcado(s) como enviado(s).`), ids);

/** Envia mesmo sem a facial confirmada (fica registrado no histórico). */
export const enviadosSemFacial = async (evento: string, ids: string[]) =>
  comAvisoDeEnvio(await lote(evento, "marcar_enviados", { p_ids: ids, p_forcar: true }, (n) => `${n} marcado(s) como enviado(s) sem confirmação da facial.`), ids);

export const desfazerEnvio = async (evento: string, ids: string[]) =>
  lote(evento, "desfazer_envio", { p_ids: ids }, (n) => `${n} envio(s) desfeito(s).`);

export const cancelarMarketing = async (evento: string, ids: string[], motivo: string) =>
  lote(evento, "cancelar_ingressos", { p_ids: ids, p_motivo: motivo }, (n) => `${n} cancelado(s); a lista de espera foi chamada.`);

export async function registrarCopia(evento: string, tipo: "cpfs" | "nome_cpf", qtd: number) {
  await exigirStaff();
  const supabase = await supabaseServidor();
  await supabase.rpc("registrar_auditoria", { p_acao: "copiar_cpfs", p_entidade: "evento", p_entidade_id: evento, p_detalhes: { tipo, qtd } });
}

/** Validar em nome da área, nome a nome (quem preencheu pelo link). */
export const validarIngressos = async (evento: string, ids: string[]) =>
  lote(evento, "validar_ingressos", { p_ids: ids }, (n) => `${n} validado(s): pronto para envio.`);
