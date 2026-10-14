import "server-only";
// Envio de e-mails a partir dos modelos editáveis. Com RESEND_API_KEY sai pelo Resend
// (domínio ingressos.weareact3.com); sem ela (modo demo/local), fica registrado como "simulado".
// Tudo vai para a tabela `envios` (caixa de saída).
import { dataHora, dataLonga } from "@/lib/formato";
import { CHAVE_LOGO, imagensDisponiveis } from "@/lib/imagens";
import { linkTorcedor, siteUrl } from "@/lib/mensagens";
import { canalEmail } from "@/lib/mensagens/email";
import { htmlEmail, preencher } from "@/lib/mensagens/modelos";
import { supabaseServico } from "@/lib/supabase/server";
import { ROTULO_SETOR, type Setor } from "@/lib/tipos";

export type Vars = Record<string, string | number | null | undefined>;

export interface ItemEnvio {
  tipo: string;
  para: { nome?: string | null; email: string };
  vars: Vars;
  botao?: { rotulo: string; url: string };
  evento_id?: string | null;
  area_id?: string | null;
  ingresso_id?: string | null;
}

export interface ResultadoEnvio {
  enviados: number;
  simulados: number;
  falhas: number;
  erros: string[];
}

export const envioReal = () => !!process.env.RESEND_API_KEY;

export async function enviarModelo(itens: ItemEnvio[], opcoes: { autor?: string | null; modelo?: { assunto: string; corpo: string } } = {}): Promise<ResultadoEnvio> {
  const res: ResultadoEnvio = { enviados: 0, simulados: 0, falhas: 0, erros: [] };
  if (!itens.length) return res;
  const sb = await supabaseServico();
  const tipos = [...new Set(itens.map((i) => i.tipo))];
  const { data: modelos } = await sb.from("modelos_email").select("chave, assunto, corpo").in("chave", tipos);
  const porChave = new Map((modelos ?? []).map((m) => [m.chave as string, m as { assunto: string; corpo: string }]));
  const img = await imagensDisponiveis();
  const logoUrl = img[CHAVE_LOGO] ? `${siteUrl()}${img[CHAVE_LOGO]}` : undefined;
  const canal = envioReal() ? canalEmail() : null;

  for (const item of itens) {
    const modelo = opcoes.modelo ?? porChave.get(item.tipo);
    if (!modelo) { res.falhas++; res.erros.push(`Modelo ${item.tipo} não encontrado`); continue; }
    const assunto = preencher(modelo.assunto, item.vars);
    const texto = preencher(modelo.corpo, item.vars);
    let status: "enviado" | "simulado" | "falhou" = "simulado";
    let erro: string | null = null;
    if (canal) {
      const r = await canal.enviar({ para: { nome: item.para.nome ?? "", email: item.para.email }, assunto, texto, html: htmlEmail(texto, { logoUrl, botao: item.botao }) });
      status = r.ok ? "enviado" : "falhou";
      erro = r.ok ? null : r.erro ?? "erro";
    }
    if (status === "enviado") res.enviados++;
    else if (status === "simulado") res.simulados++;
    else { res.falhas++; res.erros.push(`${item.para.email}: ${erro}`); }
    await sb.from("envios").insert({
      tipo: item.tipo, evento_id: item.evento_id ?? null, area_id: item.area_id ?? null, ingresso_id: item.ingresso_id ?? null,
      para_nome: item.para.nome ?? null, para_email: item.para.email, assunto, corpo: texto, status, erro, criado_por: opcoes.autor ?? null,
    });
  }
  return res;
}

export function resumoEnvio(r: ResultadoEnvio) {
  const partes = [];
  if (r.enviados) partes.push(`${r.enviados} enviado(s)`);
  if (r.simulados) partes.push(`${r.simulados} registrado(s) na caixa de saída (modo sem envio real)`);
  if (r.falhas) partes.push(`${r.falhas} com falha`);
  return partes.join(", ") || "Nenhum e-mail para enviar.";
}

// ---------------------------------------------------------------- variáveis comuns
export interface EventoVars {
  id: string;
  titulo: string;
  inicio: string;
  abertura_portoes: string | null;
  prazo_solicitacao: string | null;
  prazo_validacao: string | null;
}

export function varsEvento(ev: EventoVars): Vars {
  return {
    jogo: ev.titulo,
    data: dataLonga(ev.inicio),
    portoes: ev.abertura_portoes ? dataHora(ev.abertura_portoes).split(" ")[1] : null,
    prazo: ev.prazo_solicitacao ? dataLonga(ev.prazo_solicitacao) : null,
    prazo_validacao: ev.prazo_validacao ? dataLonga(ev.prazo_validacao) : null,
  };
}

const primeiroNome = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || null;

// ---------------------------------------------------------------- avisos aos convidados
interface IngressoContato {
  id: string;
  evento_id: string;
  setor: Setor;
  status: string;
  nome: string | null;
  email: string | null;
  token: string;
}

async function carregarContatos(ids: string[]) {
  if (!ids.length) return { ingressos: [] as IngressoContato[], eventos: new Map<string, EventoVars>() };
  const sb = await supabaseServico();
  const { data } = await sb.from("v_ingressos").select("id, evento_id, setor, status, nome, email, token").in("id", ids);
  const ingressos = (data ?? []) as IngressoContato[];
  const evIds = [...new Set(ingressos.map((i) => i.evento_id))];
  const { data: evs } = evIds.length
    ? await sb.from("eventos").select("id, titulo, inicio, abertura_portoes, prazo_solicitacao, prazo_validacao").in("id", evIds)
    : { data: [] };
  return { ingressos, eventos: new Map(((evs ?? []) as EventoVars[]).map((e) => [e.id, e])) };
}

/**
 * Aprovados com e-mail recebem o passo a passo do Galo ID e passam para "facial pendente".
 * Quem não tem e-mail continua no fluxo do WhatsApp (botão "Galo ID").
 */
export async function avisarAprovados(ids: string[], autor?: string | null): Promise<ResultadoEnvio> {
  const { ingressos, eventos } = await carregarContatos(ids);
  const alvo = ingressos.filter((i) => i.status === "aprovado" && i.email);
  const r = await enviarModelo(alvo.map((i) => ({
    tipo: "galo_id", para: { nome: i.nome, email: i.email! }, evento_id: i.evento_id, ingresso_id: i.id,
    vars: { ...varsEvento(eventos.get(i.evento_id)!), nome: primeiroNome(i.nome), setor: ROTULO_SETOR[i.setor], link: linkTorcedor(i.token) },
    botao: { rotulo: "Já fiz minha facial", url: linkTorcedor(i.token) },
  })), { autor });
  if (alvo.length) await (await supabaseServico()).rpc("registrar_orientacao", { p_ids: alvo.map((i) => i.id) });
  return r;
}

/** Ingresso marcado como enviado no sistema do Atlético. */
export async function avisarEnviados(ids: string[], autor?: string | null): Promise<ResultadoEnvio> {
  const { ingressos, eventos } = await carregarContatos(ids);
  const alvo = ingressos.filter((i) => i.status === "enviado" && i.email);
  return enviarModelo(alvo.map((i) => ({
    tipo: "ingresso_enviado", para: { nome: i.nome, email: i.email! }, evento_id: i.evento_id, ingresso_id: i.id,
    vars: { ...varsEvento(eventos.get(i.evento_id)!), nome: primeiroNome(i.nome), setor: ROTULO_SETOR[i.setor], link: linkTorcedor(i.token) },
    botao: { rotulo: "Recebi meu ingresso", url: linkTorcedor(i.token) },
  })), { autor });
}

// ---------------------------------------------------------------- áreas
export interface AreaConvocacao {
  area_id: string;
  area_nome: string;
  cotas: { setor: Setor; cota: number; ocupados: number; solicitados: number }[];
  responsaveis: { nome: string; email: string }[];
  ultima_convocacao: string | null;
  ultimo_lembrete: string | null;
}

/** Áreas com cota no evento (arquibancada/pista), seus responsáveis e quando foram avisadas. */
export async function areasParaConvocar(evento: string): Promise<AreaConvocacao[]> {
  const sb = await supabaseServico();
  const [{ data: cotas }, { data: resp }, { data: envs }, { data: ocup }] = await Promise.all([
    sb.from("cotas").select("setor, area_id, quantidade, sob_demanda, areas(nome, ordem, slug)").eq("evento_id", evento).neq("setor", "camarote").gt("quantidade", 0),
    sb.from("area_responsaveis").select("area_id, perfis(nome, email, ativo)"),
    sb.from("envios").select("tipo, area_id, criado_em").eq("evento_id", evento).in("tipo", ["convocacao_area", "lembrete_area"]),
    sb.from("ingressos").select("area_id, setor, status").eq("evento_id", evento).neq("setor", "camarote"),
  ]);
  const mapa = new Map<string, AreaConvocacao & { ordem: number }>();
  for (const c of (cotas ?? []) as unknown as { setor: Setor; area_id: string; quantidade: number; sob_demanda: boolean; areas: { nome: string; ordem: number; slug: string } }[]) {
    // a área Marketing é do próprio perfil Marketing: não recebe convocação
    if (c.sob_demanda || c.areas.slug === "marketing") continue;
    const a = mapa.get(c.area_id) ?? { area_id: c.area_id, area_nome: c.areas.nome, ordem: c.areas.ordem, cotas: [], responsaveis: [], ultima_convocacao: null, ultimo_lembrete: null };
    const doSetor = ((ocup ?? []) as { area_id: string; setor: string; status: string }[]).filter((i) => i.area_id === c.area_id && i.setor === c.setor);
    a.cotas.push({
      setor: c.setor, cota: c.quantidade,
      ocupados: doSetor.filter((i) => !["convite_expirado", "lista_espera", "recusado", "cancelado"].includes(i.status)).length,
      solicitados: doSetor.filter((i) => i.status === "solicitado").length,
    });
    mapa.set(c.area_id, a);
  }
  for (const r of (resp ?? []) as unknown as { area_id: string; perfis: { nome: string; email: string; ativo: boolean } | null }[]) {
    const a = mapa.get(r.area_id);
    if (a && r.perfis?.ativo) a.responsaveis.push({ nome: r.perfis.nome, email: r.perfis.email });
  }
  for (const e of (envs ?? []) as { tipo: string; area_id: string; criado_em: string }[]) {
    const a = mapa.get(e.area_id);
    if (!a) continue;
    if (e.tipo === "convocacao_area" && (!a.ultima_convocacao || e.criado_em > a.ultima_convocacao)) a.ultima_convocacao = e.criado_em;
    if (e.tipo === "lembrete_area" && (!a.ultimo_lembrete || e.criado_em > a.ultimo_lembrete)) a.ultimo_lembrete = e.criado_em;
  }
  return [...mapa.values()].sort((x, y) => x.ordem - y.ordem);
}

export function itensArea(tipo: "convocacao_area" | "lembrete_area", ev: EventoVars, a: AreaConvocacao): ItemEnvio[] {
  const setorPrincipal = a.cotas[0]?.setor ?? "arquibancada";
  const link = `${siteUrl()}/eventos/${ev.id}/areas/${a.area_id}?setor=${setorPrincipal}`;
  const cota = a.cotas.reduce((n, c) => n + c.cota, 0);
  const saldo = a.cotas.reduce((n, c) => n + Math.max(0, c.cota - c.ocupados), 0);
  const pendentes = a.cotas.reduce((n, c) => n + c.solicitados, 0);
  return a.responsaveis.map((r) => ({
    tipo, para: r, evento_id: ev.id, area_id: a.area_id,
    vars: {
      ...varsEvento(ev), area: a.area_nome, responsavel: primeiroNome(r.nome), cota, saldo, pendentes,
      setor: a.cotas.map((c) => ROTULO_SETOR[c.setor]).join(" e "), link,
    },
    botao: { rotulo: "Abrir a lista da área", url: link },
  }));
}

// ---------------------------------------------------------------- lembretes automáticos
/** Lembrete às áreas perto do prazo (uma vez por área) e da facial no D-2 e D-1. */
export async function executarLembretes(): Promise<{ areas: ResultadoEnvio; facial: ResultadoEnvio }> {
  const sb = await supabaseServico();
  const agora = Date.now();
  const { data: cfg } = await sb.from("config").select("valor").eq("chave", "lembrete_area_horas").maybeSingle();
  const horas = Number(cfg?.valor ?? 24);
  const { data: evs } = await sb.from("eventos").select("id, titulo, inicio, abertura_portoes, prazo_solicitacao, prazo_validacao, status").in("status", ["aberto", "fechado"]);
  const eventos = (evs ?? []) as (EventoVars & { status: string })[];

  const itensAreas: ItemEnvio[] = [];
  for (const ev of eventos.filter((e) => e.status === "aberto" && e.prazo_solicitacao)) {
    const prazo = new Date(ev.prazo_solicitacao!).getTime();
    if (prazo < agora || prazo - agora > horas * 3600e3) continue;
    for (const a of await areasParaConvocar(ev.id)) {
      const saldo = a.cotas.reduce((n, c) => n + Math.max(0, c.cota - c.ocupados), 0);
      const pendentes = a.cotas.reduce((n, c) => n + c.solicitados, 0);
      if (a.ultimo_lembrete || (saldo === 0 && pendentes === 0)) continue;
      itensAreas.push(...itensArea("lembrete_area", ev, a));
    }
  }

  const itensFacial: ItemEnvio[] = [];
  const proximos = eventos.filter((e) => { const d = new Date(e.inicio).getTime() - agora; return d > 0 && d <= 2.5 * 24 * 3600e3; });
  if (proximos.length) {
    const { data: ings } = await sb.from("v_ingressos").select("id, evento_id, setor, status, nome, email, token")
      .in("evento_id", proximos.map((e) => e.id)).in("status", ["aprovado", "facial_pendente"]);
    const comEmail = ((ings ?? []) as IngressoContato[]).filter((i) => i.email);
    const { data: recentes } = comEmail.length
      ? await sb.from("envios").select("ingresso_id").eq("tipo", "lembrete_facial").gt("criado_em", new Date(agora - 20 * 3600e3).toISOString()).in("ingresso_id", comEmail.map((i) => i.id))
      : { data: [] };
    const jaAvisados = new Set(((recentes ?? []) as { ingresso_id: string }[]).map((r) => r.ingresso_id));
    for (const i of comEmail.filter((x) => !jaAvisados.has(x.id))) {
      const ev = proximos.find((e) => e.id === i.evento_id)!;
      itensFacial.push({
        tipo: "lembrete_facial", para: { nome: i.nome, email: i.email! }, evento_id: i.evento_id, ingresso_id: i.id,
        vars: { ...varsEvento(ev), nome: primeiroNome(i.nome), setor: ROTULO_SETOR[i.setor], link: linkTorcedor(i.token) },
        botao: { rotulo: "Já fiz minha facial", url: linkTorcedor(i.token) },
      });
    }
  }
  return { areas: await enviarModelo(itensAreas), facial: await enviarModelo(itensFacial) };
}

/** Depois de qualquer aprovação no evento: avisa por e-mail quem foi aprovado e ainda não recebeu o passo a passo. */
export async function avisarAprovadosDoEvento(evento: string, autor?: string | null): Promise<ResultadoEnvio> {
  const sb = await supabaseServico();
  const { data } = await sb.from("v_ingressos").select("id, email, chegada_em").eq("evento_id", evento).eq("status", "aprovado");
  const ids = ((data ?? []) as { id: string; email: string | null; chegada_em: string | null }[])
    .filter((i) => i.email && !i.chegada_em).map((i) => i.id);
  return avisarAprovados(ids, autor);
}
