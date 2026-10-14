"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { falha, type Resultado } from "@/lib/erros";
import { deInputLocal } from "@/lib/formato";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

function dadosEvento(form: FormData) {
  const tipo = String(form.get("tipo") ?? "jogo");
  const adversario = String(form.get("adversario") ?? "").trim() || null;
  const atracao = String(form.get("atracao") ?? "").trim() || null;
  const titulo = String(form.get("titulo") ?? "").trim() || (tipo === "jogo" && adversario ? `Galo × ${adversario}` : atracao ?? "");
  return {
    tipo,
    titulo,
    adversario: tipo === "jogo" ? adversario : null,
    atracao: tipo === "show" ? atracao : null,
    competicao: String(form.get("competicao") ?? "").trim() || null,
    show_proprio: tipo === "show" ? form.get("show_proprio") === "on" : null,
    inicio: deInputLocal(form.get("inicio")),
    abertura_portoes: deInputLocal(form.get("abertura_portoes")),
    prazo_solicitacao: deInputLocal(form.get("prazo_solicitacao")),
    prazo_validacao: deInputLocal(form.get("prazo_validacao")),
    concorrido: form.get("concorrido") === "on",
    observacoes: String(form.get("observacoes") ?? "").trim() || null,
  };
}

export async function criarEvento(_: unknown, form: FormData): Promise<Resultado> {
  await exigirStaff();
  const p = { ...dadosEvento(form), status: String(form.get("status") ?? "rascunho"), duplicar_de: String(form.get("duplicar_de") ?? "") || null };
  if (!p.titulo || !p.inicio) return { ok: false, erro: "Informe o adversário/atração e a data do evento." };
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("criar_evento", { p });
  if (error) return falha(error);
  redirect(`/eventos/${data}`);
}

export async function atualizarEvento(id: string, _: unknown, form: FormData): Promise<Resultado> {
  await exigirStaff();
  const p = dadosEvento(form);
  if (!p.titulo || !p.inicio) return { ok: false, erro: "Informe o adversário/atração e a data do evento." };
  const campos: Partial<typeof p> = { ...p };
  delete campos.tipo; // o tipo não muda depois de criado
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("eventos").update(campos).eq("id", id);
  if (error) return falha(error);
  revalidatePath(`/eventos/${id}`);
  return { ok: true, mensagem: "Evento atualizado." };
}

export async function mudarStatusEvento(id: string, status: string): Promise<Resultado> {
  await exigirStaff();
  const supabase = await supabaseServidor();
  if (status === "fechado") {
    const { data, error } = await supabase.rpc("fechar_prazo", { p_evento: id });
    if (error) return falha(error);
    revalidatePath(`/eventos/${id}`);
    return { ok: true, mensagem: `Prazo encerrado. ${data} ingresso(s) não solicitados voltaram para o pool.` };
  }
  const { error } = await supabase.from("eventos").update({ status }).eq("id", id);
  if (error) return falha(error);
  revalidatePath(`/eventos/${id}`);
  return { ok: true };
}

export async function ajustarCota(evento: string, _: unknown, form: FormData): Promise<Resultado> {
  await exigirStaff();
  const supabase = await supabaseServidor();
  const area = String(form.get("area") ?? "") || null;
  const { error } = await supabase.rpc("ajustar_cota", {
    p_evento: evento,
    p_setor: String(form.get("setor")),
    p_area: area,
    p_quantidade: Number(form.get("quantidade")),
    p_motivo: String(form.get("motivo") ?? ""),
  });
  if (error) return falha(error);
  revalidatePath(`/eventos/${evento}`, "layout");
  return { ok: true, mensagem: "Cota atualizada." };
}

export async function remanejarCota(evento: string, _: unknown, form: FormData): Promise<Resultado> {
  await exigirStaff();
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("remanejar_cota", {
    p_evento: evento,
    p_setor: String(form.get("setor")),
    p_de: String(form.get("de")),
    p_para: String(form.get("para")),
    p_qtd: Number(form.get("quantidade")),
    p_motivo: String(form.get("motivo") ?? ""),
  });
  if (error) return falha(error);
  revalidatePath(`/eventos/${evento}`, "layout");
  return { ok: true, mensagem: "Saldo remanejado." };
}
