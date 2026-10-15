"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { apagarFoto, MAX_FOTO, salvarFoto, TIPOS_FOTO } from "@/lib/fotos";
import { supabaseServidor } from "@/lib/supabase/server";
import { exigirOperacao } from "../acesso";

import type { Momento } from "./dados";
const atualizar = (evento: string) => revalidatePath(`/operacao-camarote/${evento}`);

export async function responder(evento: string, item: string, status: "ok" | "problema" | "na", observacao: string): Promise<Resultado> {
  await exigirOperacao();
  const { error } = await (await supabaseServidor()).rpc("op_responder", { p_evento: evento, p_item: item, p_status: status, p_observacao: observacao || null });
  if (error) return falha(error);
  atualizar(evento);
  return { ok: true };
}

export async function concluir(evento: string, momento: Momento): Promise<Resultado> {
  await exigirOperacao();
  const { error } = await (await supabaseServidor()).rpc("op_concluir", { p_evento: evento, p_momento: momento });
  if (error) return falha(error);
  atualizar(evento);
  return { ok: true, mensagem: `Check-list ${momento === "antes" ? "antes do jogo" : "depois do jogo"} concluído.` };
}

export async function reabrir(evento: string, momento: Momento): Promise<Resultado> {
  await exigirOperacao();
  const { error } = await (await supabaseServidor()).rpc("op_reabrir", { p_evento: evento, p_momento: momento });
  if (error) return falha(error);
  atualizar(evento);
  return { ok: true, mensagem: "Check-list reaberto." };
}

export interface LinhaBebidaForm { bebida_id: string; contratado?: number | null; contagem_inicial?: number | null; contagem_final?: number | null }

export async function salvarBebidas(evento: string, linhas: LinhaBebidaForm[]): Promise<Resultado> {
  await exigirOperacao();
  const { error } = await (await supabaseServidor()).rpc("op_salvar_bebidas", { p_evento: evento, p_linhas: linhas });
  if (error) return falha(error);
  atualizar(evento);
  return { ok: true, mensagem: "Bebidas salvas." };
}

export async function salvarRelatorio(evento: string, dados: Record<string, string>, finalizar: boolean): Promise<Resultado> {
  await exigirOperacao();
  const { error } = await (await supabaseServidor()).rpc("op_salvar_relatorio", { p_evento: evento, p: dados, p_finalizar: finalizar });
  if (error) return falha(error);
  atualizar(evento);
  return { ok: true, mensagem: finalizar ? "Relatório finalizado." : "Rascunho salvo." };
}

export async function reabrirRelatorio(evento: string): Promise<Resultado> {
  await exigirOperacao();
  const { error } = await (await supabaseServidor()).rpc("op_reabrir_relatorio", { p_evento: evento });
  if (error) return falha(error);
  atualizar(evento);
  return { ok: true, mensagem: "Relatório reaberto." };
}

/** Recebe a foto já reduzida pelo navegador, guarda no Storage e registra com o horário de envio. */
export async function enviarFoto(form: FormData): Promise<Resultado<{ id: string; enviado_em: string }>> {
  await exigirOperacao();
  const evento = String(form.get("evento") ?? "");
  const momento = String(form.get("momento") ?? "relatorio");
  const item = String(form.get("item") ?? "") || null;
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return { ok: false, erro: "Escolha uma foto." };
  if (!(TIPOS_FOTO as readonly string[]).includes(arquivo.type)) return { ok: false, erro: "Envie uma imagem JPG, PNG ou WebP." };
  if (arquivo.size > MAX_FOTO) return { ok: false, erro: "Foto muito grande (máx. 5 MB)." };
  if (!/^[0-9a-f-]{36}$/.test(evento)) return { ok: false, erro: "Evento inválido." };
  const tirada = Number(form.get("tirada_em"));
  const ext = arquivo.type === "image/png" ? "png" : arquivo.type === "image/webp" ? "webp" : "jpg";
  const caminho = `${evento}/${randomUUID()}.${ext}`;
  try {
    await salvarFoto(caminho, new Uint8Array(await arquivo.arrayBuffer()), arquivo.type);
  } catch (e) {
    return { ok: false, erro: `Não foi possível guardar a foto: ${(e as Error).message}` };
  }
  const { data, error } = await (await supabaseServidor()).rpc("op_registrar_foto", {
    p_evento: evento, p_momento: momento, p_item: item, p_caminho: caminho, p_mime: arquivo.type, p_tamanho: arquivo.size,
    p_legenda: String(form.get("legenda") ?? "") || null, p_tirada_em: Number.isFinite(tirada) && tirada > 0 ? new Date(tirada).toISOString() : null,
  });
  if (error) {
    await apagarFoto(caminho);
    return falha(error);
  }
  atualizar(evento);
  return { ok: true, dados: data as { id: string; enviado_em: string } };
}

export async function removerFoto(evento: string, foto: string): Promise<Resultado> {
  await exigirOperacao();
  const { data, error } = await (await supabaseServidor()).rpc("op_remover_foto", { p_foto: foto });
  if (error) return falha(error);
  if (data) await apagarFoto(data as string);
  atualizar(evento);
  return { ok: true, mensagem: "Foto removida." };
}
