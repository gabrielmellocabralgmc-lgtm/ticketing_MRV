"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { apagarFoto, salvarFoto } from "@/lib/fotos";
import { enviarIngressosDigitais, lembrarResgate, reenviarIngressoDigital, resumoEnvio } from "@/lib/mensagens/envio";
import { exigirAdmin, exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Setor } from "@/lib/tipos";
import { lerLinks, lerNominal } from "./ler-nominal";

const MAX_PDF = 4 * 1024 * 1024; // a Vercel aceita até 4,5 MB por envio
const caminho = (evento: string) => `/eventos/${evento}/ingressos-digitais`;

/** Um PDF por chamada (o navegador manda os arquivos um a um). */
export async function subirPdf(form: FormData): Promise<Resultado> {
  await exigirStaff();
  const evento = String(form.get("evento") ?? "");
  const setor = String(form.get("setor") ?? "") as Setor;
  const nominal = form.get("nominal") === "1";
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return { ok: false, erro: "Arquivo vazio." };
  if (arquivo.type !== "application/pdf" && !/\.pdf$/i.test(arquivo.name)) return { ok: false, erro: `${arquivo.name}: não é PDF.` };
  if (arquivo.size > MAX_PDF) return { ok: false, erro: `${arquivo.name}: maior que 4 MB.` };
  if (!/^[0-9a-f-]{36}$/.test(evento)) return { ok: false, erro: "Evento inválido." };
  const local = `dig/${evento}/${randomUUID()}.pdf`;
  await salvarFoto(local, new Uint8Array(await arquivo.arrayBuffer()), "application/pdf");
  const n = nominal ? lerNominal(arquivo.name) : { nome: null, cpf: null };
  const { error } = await (await supabaseServidor()).rpc("dig_adicionar", {
    p_evento: evento, p_setor: setor,
    p_itens: [{ tipo: "pdf", caminho: local, nome_arquivo: arquivo.name, titular_nome: n.nome, titular_cpf: n.cpf }],
  });
  if (error) {
    await apagarFoto(local);
    return falha(error);
  }
  revalidatePath(caminho(evento));
  return { ok: true };
}

export async function colarLinks(evento: string, setor: Setor, texto: string, nominal: boolean): Promise<Resultado> {
  await exigirStaff();
  const linhas = lerLinks(texto, nominal);
  const semLink = linhas.filter((l) => !l.url);
  if (!linhas.length) return { ok: false, erro: "Cole pelo menos um link (um por linha)." };
  if (semLink.length) return { ok: false, erro: `Linha sem link (https://…): "${semLink[0].linha.slice(0, 60)}"` };
  const { data, error } = await (await supabaseServidor()).rpc("dig_adicionar", {
    p_evento: evento, p_setor: setor,
    p_itens: linhas.map((l) => ({ tipo: "link", url: l.url, titular_nome: l.titular_nome, titular_cpf: l.titular_cpf })),
  });
  if (error) return falha(error);
  revalidatePath(caminho(evento));
  return { ok: true, mensagem: `${data} link(s) adicionados ao estoque.` };
}

export async function distribuir(evento: string): Promise<Resultado> {
  await exigirStaff();
  const { data, error } = await (await supabaseServidor()).rpc("dig_atribuir", { p_evento: evento });
  if (error) return falha(error);
  revalidatePath(caminho(evento));
  const r = data as { por_cpf: number; por_nome: number; genericos: number; sem_ingresso: number };
  const total = r.por_cpf + r.por_nome + r.genericos;
  return {
    ok: true,
    mensagem: `${total} ingresso(s) distribuído(s)${r.por_cpf + r.por_nome ? ` (${r.por_cpf + r.por_nome} nominais)` : ""}.`
      + (r.sem_ingresso ? ` ⚠️ ${r.sem_ingresso} convidado(s) ficaram sem ingresso: suba mais PDFs/links e distribua de novo.` : ""),
  };
}

export async function enviar(evento: string): Promise<Resultado> {
  const s = await exigirStaff();
  const r = await enviarIngressosDigitais(evento, s.userId);
  if (r.enviados.length) {
    const { error } = await (await supabaseServidor()).rpc("dig_marcar_enviados", { p_ingressos: r.enviados });
    if (error) return falha(error);
  }
  revalidatePath(caminho(evento));
  if (!r.enviados.length && !r.semEmail.length && !r.falhas.length) return { ok: false, erro: "Nada para enviar: distribua os ingressos primeiro (só vai para quem está pronto para envio)." };
  const partes = [`${r.enviados.length} ingresso(s) enviado(s)${r.simulado ? " (modo sem e-mail real: ficaram na caixa de saída)" : ""}`];
  if (r.semEmail.length) partes.push(`${r.semEmail.length} sem e-mail: copie o “Link do ingresso” na tabela, mande pelo WhatsApp e clique em “Marcar como enviado”: ${r.semEmail.slice(0, 5).join(", ")}${r.semEmail.length > 5 ? "…" : ""}`);
  if (r.falhas.length) partes.push(`${r.falhas.length} com falha: ${r.falhas.slice(0, 2).join(" | ")}`);
  return r.falhas.length ? { ok: false, erro: partes.join(". ") + "." } : { ok: true, mensagem: partes.join(". ") + "." };
}

export async function remover(evento: string, id: string): Promise<Resultado> {
  await exigirStaff();
  const { data, error } = await (await supabaseServidor()).rpc("dig_remover", { p_id: id });
  if (error) return falha(error);
  if (data) await apagarFoto(data as string);
  revalidatePath(caminho(evento));
  return { ok: true, mensagem: "Removido do estoque." };
}

export async function desatribuir(evento: string, id: string): Promise<Resultado> {
  await exigirStaff();
  const { error } = await (await supabaseServidor()).rpc("dig_desatribuir", { p_id: id });
  if (error) return falha(error);
  revalidatePath(caminho(evento));
  return { ok: true, mensagem: "O ingresso voltou para o estoque." };
}

/** Enviado "por fora" (WhatsApp etc.): marca como enviado e libera o botão na página do convidado. */
export async function liberarSemEmail(evento: string, ingresso: string): Promise<Resultado> {
  await exigirStaff();
  const { error } = await (await supabaseServidor()).rpc("dig_marcar_enviados", { p_ingressos: [ingresso] });
  if (error) return falha(error);
  revalidatePath(caminho(evento));
  return { ok: true, mensagem: "Marcado como enviado. O ingresso também aparece na página pessoal do convidado." };
}

/** Link de resgate único: o convidado abriu e não deu certo (ex.: não estava logado). Libera uma nova tentativa. */
export async function liberarResgate(evento: string, id: string): Promise<Resultado> {
  await exigirStaff();
  const { error } = await (await supabaseServidor()).rpc("dig_liberar_resgate", { p_id: id });
  if (error) return falha(error);
  revalidatePath(caminho(evento));
  return { ok: true, mensagem: "Novo resgate liberado. O convidado já pode tentar de novo pela página pessoal." };
}

/** Corrige o e-mail do convidado (mesmo já enviado). O ingresso e o link continuam os mesmos. */
export async function alterarEmail(evento: string, ingresso: string, email: string): Promise<Resultado> {
  await exigirAdmin();
  const { data, error } = await (await supabaseServidor()).rpc("alterar_email_ingresso", { p_ingresso: ingresso, p_email: email });
  if (error) return falha(error);
  revalidatePath(caminho(evento));
  return { ok: true, mensagem: `E-mail alterado para ${data}. Se o ingresso já tinha sido enviado, clique em “reenviar” para mandar para o e-mail novo.` };
}

/** Manda de novo o e-mail do ingresso já enviado (mesmo ingresso, mesmo link) para o e-mail atual. */
export async function reenviar(evento: string, ingresso: string): Promise<Resultado> {
  const s = await exigirAdmin();
  try {
    const r = await reenviarIngressoDigital(ingresso, s.userId);
    revalidatePath(caminho(evento));
    if (r.falhas) return { ok: false, erro: `Não foi possível reenviar: ${r.erros.join("; ")}` };
    return { ok: true, mensagem: r.simulados ? "Reenviado (modo sem e-mail real: ficou na caixa de saída)." : "Ingresso reenviado para o e-mail atual." };
  } catch (e) {
    return falha(e);
  }
}

/** Link de resgate único: lembra por e-mail quem já recebeu e ainda não resgatou. */
export async function lembrarQuemNaoResgatou(evento: string): Promise<Resultado> {
  const s = await exigirAdmin();
  try {
    const r = await lembrarResgate(evento, s.userId);
    revalidatePath(caminho(evento));
    const total = r.enviados + r.simulados + r.falhas;
    if (!total && !r.semEmail.length) return { ok: false, erro: "Ninguém para lembrar: todos que receberam já resgataram." };
    const partes = [`Lembrete de resgate: ${resumoEnvio(r)}`];
    if (r.semEmail.length) partes.push(`${r.semEmail.length} sem e-mail (lembre pelo WhatsApp): ${r.semEmail.slice(0, 5).join(", ")}${r.semEmail.length > 5 ? "…" : ""}`);
    if (r.falhas) partes.push(r.erros.slice(0, 2).join(" | "));
    return r.falhas ? { ok: false, erro: partes.join(". ") + "." } : { ok: true, mensagem: partes.join(". ") + "." };
  } catch (e) {
    return falha(e);
  }
}
