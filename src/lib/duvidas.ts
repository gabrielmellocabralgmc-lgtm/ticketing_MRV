import "server-only";
// Dúvidas de gestores e convidados para a equipe de ingressos (Admin act.3). A conversa já guarda o
// contexto (evento, área, ingresso, quem perguntou). Só o servidor lê/grava, depois de conferir a pessoa.
import { randomUUID } from "node:crypto";
import { canalEmail } from "@/lib/mensagens/email";
import { htmlEmail } from "@/lib/mensagens/modelos";
import { linkTorcedor, siteUrl } from "@/lib/mensagens";
import { supabaseServico } from "@/lib/supabase/server";

/** Caixa operacional da equipe de ingressos: recebe os avisos de dúvida e as respostas aos e-mails. */
export const EMAIL_OPERACIONAL = () => process.env.EMAIL_OPERACIONAL || "ingresso.mrv@weareact3.com";

export type Status = "aguardando" | "respondida" | "resolvida";
export interface Mensagem { id: number; de: "equipe" | "gestor" | "convidado"; autor_nome: string | null; texto: string; criado_em: string }
export interface Duvida {
  id: string; evento_id: string; area_id: string | null; ingresso_id: string | null;
  autor_tipo: "gestor" | "convidado" | "equipe"; autor_user: string | null; autor_nome: string; autor_email: string | null;
  status: Status; criado_em: string; atualizado_em: string;
}
export interface DuvidaCompleta extends Duvida { evento_titulo: string; area_nome: string | null; mensagens: Mensagem[] }

const limpar = (t: string) => t.replace(/\r\n/g, "\n").trim().slice(0, 4000);
const ficticio = (email: string) => /@([^@]+\.)?(invalid|exemplo\.com|example\.com)$/i.test(email);

async function completar(lista: Duvida[]): Promise<DuvidaCompleta[]> {
  if (!lista.length) return [];
  const sb = await supabaseServico();
  const ids = lista.map((d) => d.id);
  const areaIds = [...new Set(lista.map((d) => d.area_id).filter(Boolean))] as string[];
  const [{ data: msgs }, { data: evs }, { data: areas }] = await Promise.all([
    sb.from("duvida_mensagens").select("id, duvida_id, de, autor_nome, texto, criado_em").in("duvida_id", ids).order("criado_em"),
    sb.from("eventos").select("id, titulo").in("id", [...new Set(lista.map((d) => d.evento_id))]),
    areaIds.length ? sb.from("areas").select("id, nome").in("id", areaIds) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const evNome = new Map((evs ?? []).map((e) => [e.id as string, e.titulo as string]));
  const areaNome = new Map((areas ?? []).map((a) => [a.id as string, a.nome as string]));
  return lista.map((d) => ({
    ...d,
    evento_titulo: evNome.get(d.evento_id) ?? "—",
    area_nome: d.area_id ? areaNome.get(d.area_id) ?? null : null,
    mensagens: ((msgs ?? []) as (Mensagem & { duvida_id: string })[]).filter((m) => m.duvida_id === d.id),
  }));
}

const CAMPOS = "id, evento_id, area_id, ingresso_id, autor_tipo, autor_user, autor_nome, autor_email, status, criado_em, atualizado_em";

/** Conversas de uma área num evento: abertas por gestores ou pela equipe (qualquer gestor da área vê todas). */
export async function duvidasDaArea(evento: string, area: string) {
  const { data } = await (await supabaseServico()).from("duvidas").select(CAMPOS)
    .eq("evento_id", evento).eq("area_id", area).in("autor_tipo", ["gestor", "equipe"])
    .order("atualizado_em", { ascending: false });
  return completar(((data ?? []) as Duvida[]).filter((d) => !d.ingresso_id));
}

/** A conversa do convidado (uma por ingresso), se existir. */
export async function duvidaDoIngresso(ingresso: string) {
  const { data } = await (await supabaseServico()).from("duvidas").select(CAMPOS).eq("ingresso_id", ingresso).limit(1);
  return (await completar((data ?? []) as Duvida[]))[0] ?? null;
}

/** Equipe: todas, mais recentes primeiro. */
export async function todasDuvidas(status?: Status) {
  let q = (await supabaseServico()).from("duvidas").select(CAMPOS);
  if (status) q = q.eq("status", status);
  const { data } = await q.order("atualizado_em", { ascending: false }).limit(300);
  return completar((data ?? []) as Duvida[]);
}

export async function contarAguardando() {
  const { data } = await (await supabaseServico()).from("duvidas").select("id").eq("status", "aguardando");
  return (data ?? []).length;
}

export async function buscarDuvida(id: string) {
  const { data } = await (await supabaseServico()).from("duvidas").select(CAMPOS).eq("id", id).maybeSingle();
  return data ? (await completar([data as Duvida]))[0] : null;
}

/** Abre uma conversa nova (gestor) ou acrescenta à do ingresso (convidado), e avisa a equipe. */
export async function novaDuvida(d: Omit<Duvida, "id" | "status" | "criado_em" | "atualizado_em">, texto: string) {
  const sb = await supabaseServico();
  const msg = limpar(texto);
  if (!msg) throw new Error("Escreva a sua dúvida.");
  let id: string = randomUUID();
  if (d.ingresso_id) {
    const existente = await duvidaDoIngresso(d.ingresso_id);
    if (existente) id = existente.id;
  }
  const { data: ja } = await sb.from("duvidas").select("id").eq("id", id).maybeSingle();
  if (!ja) {
    const { error } = await sb.from("duvidas").insert({ id, ...d, status: "aguardando" });
    if (error) throw new Error(error.message);
  }
  await registrarMensagem(id, d.autor_tipo, d.autor_user, d.autor_nome, msg);
  return id;
}

/** Responsáveis ativos de uma área (quem recebe as mensagens da equipe para a área). */
export async function responsaveisDaArea(area: string) {
  const { data } = await (await supabaseServico()).from("area_responsaveis").select("perfis(nome, email, ativo)").eq("area_id", area);
  return ((data ?? []) as unknown as { perfis: { nome: string; email: string; ativo: boolean } | null }[])
    .map((r) => r.perfis).filter((p): p is { nome: string; email: string; ativo: boolean } => !!p?.ativo && !!p.email)
    .map(({ nome, email }) => ({ nome, email }));
}

/** A equipe (Admin) abre uma conversa com a área: todos os responsáveis são avisados por e-mail. */
export async function mensagemParaArea(evento: string, area: string, autor: { userId: string; nome: string; email: string | null }, texto: string) {
  const msg = limpar(texto);
  if (!msg) throw new Error("Escreva a mensagem.");
  if (!(await responsaveisDaArea(area)).length) throw new Error("Esta área não tem responsável cadastrado. Cadastre em Configurações › Áreas e responsáveis.");
  const id = randomUUID();
  const { error } = await (await supabaseServico()).from("duvidas").insert({
    id, evento_id: evento, area_id: area, ingresso_id: null, autor_tipo: "equipe",
    autor_user: autor.userId, autor_nome: autor.nome, autor_email: autor.email, status: "respondida",
  });
  if (error) throw new Error(error.message);
  await registrarMensagem(id, "equipe", autor.userId, autor.nome, msg);
  return id;
}

/** Nova mensagem numa conversa. Da equipe: vira "respondida" e avisa quem perguntou; do outro lado: "aguardando" e avisa a equipe. */
export async function registrarMensagem(id: string, de: Mensagem["de"], autorUser: string | null, autorNome: string | null, texto: string) {
  const sb = await supabaseServico();
  const msg = limpar(texto);
  if (!msg) throw new Error("Escreva a mensagem.");
  const { error } = await sb.from("duvida_mensagens").insert({ duvida_id: id, de, autor_user: autorUser, autor_nome: autorNome, texto: msg });
  if (error) throw new Error(error.message);
  await sb.from("duvidas").update({ status: de === "equipe" ? "respondida" : "aguardando", atualizado_em: new Date().toISOString() }).eq("id", id);
  const d = await buscarDuvida(id);
  if (d) await (de === "equipe" ? avisarAutor(d, msg) : avisarEquipe(d, msg, autorNome)).catch((e) => console.error("[duvidas] aviso por e-mail falhou:", e));
}

export async function marcarStatus(id: string, status: Status) {
  await (await supabaseServico()).from("duvidas").update({ status, atualizado_em: new Date().toISOString() }).eq("id", id);
}

/** Onde a pessoa vê e responde a conversa. */
async function linkDaConversa(d: Duvida) {
  if (d.ingresso_id) {
    const { data } = await (await supabaseServico()).from("ingressos").select("token").eq("id", d.ingresso_id).maybeSingle();
    return data?.token ? `${linkTorcedor(data.token as string)}#ajuda` : siteUrl();
  }
  return `${siteUrl()}/eventos/${d.evento_id}/areas/${d.area_id}#duvidas`;
}

const contexto = (d: DuvidaCompleta) => [d.evento_titulo, d.area_nome, d.autor_tipo === "convidado" ? `convidado ${d.autor_nome}` : d.autor_nome].filter(Boolean).join(" · ");

async function enviar(para: { nome: string; email: string }, assunto: string, texto: string, botao: { rotulo: string; url: string }) {
  if (!process.env.RESEND_API_KEY || ficticio(para.email)) {
    console.log(`[duvidas] (sem envio real) para ${para.email}: ${assunto}`);
    return;
  }
  const r = await canalEmail({ responderPara: EMAIL_OPERACIONAL() }).enviar({ para, assunto, texto: `${texto}\n\n${botao.url}`, html: htmlEmail(texto, { botao }) });
  if (!r.ok) console.error(`[duvidas] e-mail para ${para.email} falhou: ${r.erro}`);
}

async function avisarEquipe(d: DuvidaCompleta, msg: string, quem?: string | null) {
  if (d.autor_tipo === "equipe") {
    await enviar({ nome: "Equipe de ingressos", email: EMAIL_OPERACIONAL() }, `Resposta da área · ${[d.evento_titulo, d.area_nome].filter(Boolean).join(" · ")}`,
      `${quem ?? "Um responsável"} respondeu à mensagem da equipe.\n\nEvento: ${d.evento_titulo}${d.area_nome ? `\nÁrea: ${d.area_nome}` : ""}\n\n“${msg}”`,
      { rotulo: "Responder no sistema", url: `${siteUrl()}/duvidas#${d.id}` });
    return;
  }
  await enviar({ nome: "Equipe de ingressos", email: EMAIL_OPERACIONAL() }, `Dúvida · ${contexto(d)}`,
    `Nova mensagem de ${d.autor_nome}${d.autor_email ? ` (${d.autor_email})` : ""}.\n\nEvento: ${d.evento_titulo}${d.area_nome ? `\nÁrea: ${d.area_nome}` : ""}\n${d.autor_tipo === "convidado" ? "Quem pergunta: convidado" : "Quem pergunta: gestor da área"}\n\n“${msg}”`,
    { rotulo: "Responder no sistema", url: `${siteUrl()}/duvidas#${d.id}` });
}

async function avisarAutor(d: DuvidaCompleta, msg: string) {
  // conversa aberta pela equipe: a mensagem é para a área inteira (todos os responsáveis)
  if (d.autor_tipo === "equipe" && d.area_id) {
    const primeira = d.mensagens.length <= 1;
    const link = await linkDaConversa(d);
    for (const p of await responsaveisDaArea(d.area_id)) {
      await enviar(p, `${primeira ? "Mensagem" : "Nova mensagem"} da equipe de ingressos · ${d.evento_titulo}`,
        `Olá, ${p.nome.split(" ")[0]}!\n\nA equipe de ingressos MRV ${primeira ? "mandou uma mensagem" : "escreveu de novo"} para a área ${d.area_nome ?? ""} sobre ${d.evento_titulo}:\n\n“${msg}”\n\nPara responder, use o botão abaixo (a conversa fica na lista da sua área).`,
        { rotulo: "Ver e responder", url: link });
    }
    return;
  }
  if (!d.autor_email) return;
  await enviar({ nome: d.autor_nome, email: d.autor_email }, `Resposta da equipe de ingressos · ${d.evento_titulo}`,
    `Olá, ${d.autor_nome.split(" ")[0]}!\n\nA equipe de ingressos MRV respondeu a sua dúvida sobre ${d.evento_titulo}:\n\n“${msg}”\n\nSe precisar, continue a conversa pelo botão abaixo.`,
    { rotulo: "Ver a conversa", url: await linkDaConversa(d) });
}

/** A área cancelou um ingresso que já tinha sido enviado: a equipe cancela também no sistema do Atlético. */
export async function avisarEquipeCancelamento(c: { evento: string; area: string; nome: string | null; area_nome: string; setor: string; por: string; motivo: string }) {
  const { data: ev } = await (await supabaseServico()).from("eventos").select("titulo").eq("id", c.evento).maybeSingle();
  const titulo = (ev?.titulo as string | undefined) ?? "evento";
  await enviar({ nome: "Equipe de ingressos", email: EMAIL_OPERACIONAL() }, `Cancelado após o envio · ${titulo} · ${c.area_nome}`,
    `${c.por} cancelou o ingresso de ${c.nome ?? "(sem nome)"} (${c.area_nome}, ${c.setor}) em ${titulo}.\n\nO ingresso JÁ TINHA SIDO ENVIADO: cancele também no sistema do Atlético.\n\nMotivo: ${c.motivo || "—"}\n\nO lugar voltou para o saldo da área.`,
    { rotulo: "Abrir a lista da área", url: `${siteUrl()}/eventos/${c.evento}/areas/${c.area}` });
}
