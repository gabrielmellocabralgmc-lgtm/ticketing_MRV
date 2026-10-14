"use server";
import { revalidatePath } from "next/cache";
import type { Resultado } from "@/lib/erros";
import { htmlEmail, preencher } from "@/lib/mensagens/modelos";
import {
  areasParaConvocar, enviarModelo, executarLembretes, itensArea, resumoEnvio, type EventoVars,
} from "@/lib/mensagens/envio";
import { CHAVE_LOGO, imagensDisponiveis } from "@/lib/imagens";
import { siteUrl } from "@/lib/mensagens";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase/server";

async function carregar(evento: string) {
  const { data } = await (await supabaseServico()).from("eventos")
    .select("id, titulo, inicio, abertura_portoes, prazo_solicitacao, prazo_validacao").eq("id", evento).single();
  return data as EventoVars;
}

/** Prévia do e-mail de convocação para uma área (como o responsável vai receber). */
export async function previaConvocacao(evento: string, area: string): Promise<{ assunto: string; html: string; para: string } | null> {
  await exigirStaff();
  const [ev, areas] = await Promise.all([carregar(evento), areasParaConvocar(evento)]);
  const a = areas.find((x) => x.area_id === area);
  if (!a) return null;
  const item = itensArea("convocacao_area", ev, { ...a, responsaveis: a.responsaveis.length ? a.responsaveis : [{ nome: "Responsável", email: "—" }] })[0];
  const { data: m } = await (await supabaseServico()).from("modelos_email").select("assunto, corpo").eq("chave", "convocacao_area").single();
  const img = await imagensDisponiveis();
  return {
    assunto: preencher(m!.assunto, item.vars),
    html: htmlEmail(preencher(m!.corpo, item.vars), { logoUrl: img[CHAVE_LOGO] ? `${siteUrl()}${img[CHAVE_LOGO]}` : undefined, botao: item.botao }),
    para: a.responsaveis.map((r) => r.email).join(", ") || "(área sem responsável)",
  };
}

export async function enviarConvocacao(evento: string, areas: string[], soParaMim = false): Promise<Resultado> {
  const s = await exigirStaff();
  const [ev, todas] = await Promise.all([carregar(evento), areasParaConvocar(evento)]);
  const escolhidas = todas.filter((a) => areas.includes(a.area_id));
  if (!escolhidas.length) return { ok: false, erro: "Escolha pelo menos uma área." };
  const itens = soParaMim
    ? itensArea("convocacao_area", ev, { ...escolhidas[0], responsaveis: [{ nome: s.nome, email: s.email }] }).map((i) => ({ ...i, area_id: null }))
    : escolhidas.flatMap((a) => itensArea("convocacao_area", ev, a));
  const semResponsavel = escolhidas.filter((a) => !a.responsaveis.length).map((a) => a.area_nome);
  const r = await enviarModelo(itens, { autor: s.userId });
  revalidatePath(`/eventos/${evento}`);
  if (r.falhas) return { ok: false, erro: `${resumoEnvio(r)}: ${r.erros.join("; ")}` };
  return {
    ok: true,
    mensagem: `${soParaMim ? `Teste para ${s.email}: ` : ""}${resumoEnvio(r)}${semResponsavel.length ? `. Sem responsável cadastrado: ${semResponsavel.join(", ")}` : ""}.`,
  };
}

export async function rodarLembretes(evento: string): Promise<Resultado> {
  await exigirStaff();
  const r = await executarLembretes();
  revalidatePath(`/eventos/${evento}`);
  return { ok: true, mensagem: `Lembretes às áreas: ${resumoEnvio(r.areas)} · Lembretes da facial: ${resumoEnvio(r.facial)}` };
}
