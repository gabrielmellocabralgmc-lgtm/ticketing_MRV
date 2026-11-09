"use server";
import { revalidatePath } from "next/cache";
import type { Resultado } from "@/lib/erros";
import { htmlEmail, preencher } from "@/lib/mensagens/modelos";
import {
  anexoConvocacao, areasParaConvocar, arquivoAnexoConvocacao, avisarOperacaoLista, enviarModelo, executarLembretes, itensArea, itensCamarote, resumoEnvio,
  type EventoVars, type GrupoCamarote,
} from "@/lib/mensagens/envio";
import { CHAVE_LOGO, chaveMapaEvento, imagensDisponiveis } from "@/lib/imagens";
import { siteUrl } from "@/lib/mensagens";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServico } from "@/lib/supabase/server";

async function carregar(evento: string) {
  const { data } = await (await supabaseServico()).from("eventos")
    .select("id, titulo, inicio, abertura_portoes, prazo_solicitacao, prazo_validacao, exige_facial, tipo, ingressos_digitais, resgate_unico, orientacoes_convidado, nomes_setores").eq("id", evento).single();
  return data as EventoVars;
}

/** Prévia do e-mail de convocação para uma área (como o responsável vai receber). */
export async function previaConvocacao(evento: string, area: string): Promise<{ assunto: string; html: string; para: string } | null> {
  await exigirStaff();
  const [ev, areas] = await Promise.all([carregar(evento), areasParaConvocar(evento)]);
  const a = areas.find((x) => x.area_id === area);
  if (!a) return null;
  const item = itensArea("convocacao_area", ev, { ...a, responsaveis: a.responsaveis.length ? a.responsaveis : [{ nome: "Responsável", email: "—" }] })[0];
  // shows usam a versão "_show" do modelo, se existir
  const chaves = ev.tipo === "show" ? ["convocacao_area_show", "convocacao_area"] : ["convocacao_area"];
  const { data: ms } = await (await supabaseServico()).from("modelos_email").select("chave, assunto, corpo").in("chave", chaves);
  const m = chaves.map((c) => (ms ?? []).find((x) => x.chave === c)).find(Boolean);
  const img = await imagensDisponiveis();
  return {
    assunto: preencher(m!.assunto, item.vars),
    html: htmlEmail(preencher(m!.corpo, item.vars), {
      logoUrl: img[CHAVE_LOGO] ? `${siteUrl()}${img[CHAVE_LOGO]}` : undefined, botao: item.botao,
      mapaUrl: img[chaveMapaEvento(evento)] ? `${siteUrl()}${img[chaveMapaEvento(evento)]}` : undefined,
    }),
    para: a.responsaveis.map((r) => r.email).join(", ") || "(área sem responsável)",
  };
}

export async function enviarConvocacao(evento: string, areas: string[], soParaMim = false, anexar = false): Promise<Resultado> {
  const s = await exigirStaff();
  const [ev, todas, anexo] = await Promise.all([carregar(evento), areasParaConvocar(evento), anexar ? arquivoAnexoConvocacao() : null]);
  if (anexar && !anexo) return { ok: false, erro: "O PDF anexo não foi encontrado. Suba o arquivo de novo." };
  const escolhidas = todas.filter((a) => areas.includes(a.area_id));
  if (!escolhidas.length) return { ok: false, erro: "Escolha pelo menos uma área." };
  const itens = soParaMim
    ? itensArea("convocacao_area", ev, { ...escolhidas[0], responsaveis: [{ nome: s.nome, email: s.email }] }).map((i) => ({ ...i, area_id: null }))
    : escolhidas.flatMap((a) => itensArea("convocacao_area", ev, a));
  const semResponsavel = escolhidas.filter((a) => !a.responsaveis.length).map((a) => a.area_nome);
  const r = await enviarModelo(itens, { autor: s.userId, anexos: anexo ? [anexo] : undefined });
  revalidatePath(`/eventos/${evento}`);
  if (r.falhas) return { ok: false, erro: `${resumoEnvio(r)}: ${r.erros.join("; ")}` };
  return {
    ok: true,
    mensagem: `${soParaMim ? `Teste para ${s.email}: ` : ""}${resumoEnvio(r)}${semResponsavel.length ? `. Sem responsável cadastrado: ${semResponsavel.join(", ")}` : ""}.`,
  };
}

/** Reenvio opcional: só para os responsáveis da área que ainda não receberam a convocação (ex.: cadastrados depois). */
export async function enviarConvocacaoFaltantes(evento: string, area: string, anexar = false): Promise<Resultado> {
  const s = await exigirStaff();
  const anexo = anexar ? await arquivoAnexoConvocacao() : null;
  const [ev, todas] = await Promise.all([carregar(evento), areasParaConvocar(evento)]);
  const a = todas.find((x) => x.area_id === area);
  const faltam = (a?.responsaveis ?? []).filter((r) => !r.recebeu).map(({ nome, email }) => ({ nome, email }));
  if (!a || !faltam.length) return { ok: false, erro: "Todos os responsáveis desta área já receberam a convocação." };
  const r = await enviarModelo(itensArea("convocacao_area", ev, { ...a, responsaveis: faltam }), { autor: s.userId, anexos: anexo ? [anexo] : undefined });
  revalidatePath(`/eventos/${evento}`);
  if (r.falhas) return { ok: false, erro: `${resumoEnvio(r)}: ${r.erros.join("; ")}` };
  return { ok: true, mensagem: `Convocação de ${a.area_nome} para ${faltam.map((f) => f.nome).join(", ")}: ${resumoEnvio(r)}.` };
}

export async function rodarLembretes(evento: string): Promise<Resultado> {
  await exigirStaff();
  const r = await executarLembretes();
  revalidatePath(`/eventos/${evento}`);
  return { ok: true, mensagem: `Lembretes às áreas: ${resumoEnvio(r.areas)} · Lembretes da facial: ${resumoEnvio(r.facial)}` };
}

/** Camarote: e-mail para uma onda (VPs, Diretoria ou Gestores). */
export async function enviarCamarote(evento: string, grupo: GrupoCamarote, soParaMim = false): Promise<Resultado> {
  const s = await exigirStaff();
  const ev = await carregar(evento);
  const itens = await itensCamarote(grupo, ev, soParaMim ? [{ nome: s.nome, email: s.email }] : undefined);
  if (!itens.length) return { ok: false, erro: "Nenhum contato ativo neste grupo. Cadastre em Configurações › Áreas e responsáveis." };
  // o teste não conta como envio da onda
  const r = await enviarModelo(soParaMim ? itens.map((i) => ({ ...i, evento_id: null })) : itens, { autor: s.userId });
  revalidatePath(`/eventos/${evento}`);
  if (r.falhas) return { ok: false, erro: `${resumoEnvio(r)}: ${r.erros.join("; ")}` };
  return { ok: true, mensagem: `${soParaMim ? `Teste para ${s.email}: ` : ""}${resumoEnvio(r)}.` };
}

/** Operação do camarote: lista dos confirmados (também sai sozinha quando as solicitações fecham). */
export async function enviarListaOperacao(evento: string): Promise<Resultado> {
  const s = await exigirStaff();
  const r = await avisarOperacaoLista(evento, s.userId);
  revalidatePath(`/eventos/${evento}`);
  if (!r.enviados && !r.simulados && !r.falhas) return { ok: false, erro: "Nenhum usuário com perfil Operação do camarote ativo." };
  if (r.falhas) return { ok: false, erro: `${resumoEnvio(r)}: ${r.erros.join("; ")}` };
  return { ok: true, mensagem: `Lista enviada à operação: ${resumoEnvio(r)}.` };
}

/** Sobe (ou troca) o PDF que vai anexado na convocação das áreas. Vale para todos os eventos. */
export async function subirAnexoConvocacao(evento: string, form: FormData): Promise<Resultado> {
  await exigirStaff();
  const f = form.get("arquivo");
  if (!(f instanceof File) || !f.size) return { ok: false, erro: "Escolha um arquivo PDF." };
  if (f.type !== "application/pdf" && !/\.pdf$/i.test(f.name)) return { ok: false, erro: "O anexo precisa ser um PDF." };
  // a Vercel aceita até ~4,5 MB por envio
  if (f.size > 4 * 1024 * 1024) return { ok: false, erro: "PDF grande demais (máx. 4 MB)." };
  const { apagarFoto, salvarFoto } = await import("@/lib/fotos");
  const antigo = await anexoConvocacao();
  const caminho = `anexos/convocacao-${Date.now()}.pdf`;
  await salvarFoto(caminho, new Uint8Array(await f.arrayBuffer()), "application/pdf");
  const nome = f.name.replace(/[^\w.\- ()À-ú]+/g, "_").slice(0, 120) || "anexo.pdf";
  const { error } = await (await supabaseServico()).from("config")
    .upsert({ chave: "anexo_convocacao", valor: { nome, caminho, tamanho: f.size, atualizado_em: new Date().toISOString() } });
  if (error) return { ok: false, erro: error.message };
  if (antigo) await apagarFoto(antigo.caminho).catch(() => null);
  revalidatePath(`/eventos/${evento}`);
  return { ok: true, mensagem: `PDF “${nome}” pronto para ir anexado na convocação.` };
}

export async function removerAnexoConvocacao(evento: string): Promise<Resultado> {
  await exigirStaff();
  const antigo = await anexoConvocacao();
  await (await supabaseServico()).from("config").delete().eq("chave", "anexo_convocacao");
  if (antigo) {
    const { apagarFoto } = await import("@/lib/fotos");
    await apagarFoto(antigo.caminho).catch(() => null);
  }
  revalidatePath(`/eventos/${evento}`);
  return { ok: true, mensagem: "Anexo removido." };
}
