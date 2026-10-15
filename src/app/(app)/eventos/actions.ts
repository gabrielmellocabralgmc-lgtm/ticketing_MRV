"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { falha, type Resultado } from "@/lib/erros";
import { deInputLocal } from "@/lib/formato";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

/** Título sempre automático: "Galo × Adversário" (jogo) ou o nome do show. */
function tituloEvento(tipo: string, adversario: string | null, atracao: string | null) {
  return tipo === "jogo" ? (adversario ? `Galo × ${adversario}` : "") : atracao ?? "";
}

/** Portões: jogo = 3 h antes do início; show = horário informado, no mesmo dia do show. */
function aberturaPortoes(tipo: string, inicio: string | null, horaShow: string) {
  if (!inicio) return null;
  if (tipo === "jogo") return new Date(new Date(inicio).getTime() - 3 * 3600e3).toISOString();
  if (!/^\d{2}:\d{2}$/.test(horaShow)) return null;
  const dia = inicio.slice(0, 10); // inicio vem como "AAAA-MM-DDTHH:MM:00-03:00" (horário de Brasília)
  return `${dia}T${horaShow}:00-03:00`;
}

function dadosEvento(form: FormData) {
  const tipo = String(form.get("tipo") ?? "jogo");
  const adversario = String(form.get("adversario") ?? "").trim() || null;
  const atracao = String(form.get("atracao") ?? "").trim() || null;
  const inicio = deInputLocal(form.get("inicio"));
  return {
    tipo,
    titulo: tituloEvento(tipo, adversario, atracao),
    adversario: tipo === "jogo" ? adversario : null,
    atracao: tipo === "show" ? atracao : null,
    competicao: String(form.get("competicao") ?? "").trim() || null,
    show_proprio: tipo === "show" ? form.get("show_proprio") === "on" : null,
    inicio,
    abertura_portoes: aberturaPortoes(tipo, inicio, String(form.get("portoes_hora") ?? "")),
    prazo_solicitacao: deInputLocal(form.get("prazo_solicitacao")),
    prazo_validacao: deInputLocal(form.get("prazo_validacao")),
    concorrido: form.get("concorrido") === "on",
    observacoes: String(form.get("observacoes") ?? "").trim() || null,
  };
}

export async function criarEvento(_: unknown, form: FormData): Promise<Resultado> {
  await exigirStaff();
  const p = { ...dadosEvento(form), status: String(form.get("status") ?? "rascunho"), duplicar_de: String(form.get("duplicar_de") ?? "") || null };
  if (!p.titulo || !p.inicio) return { ok: false, erro: "Informe o adversário (ou o nome do show) e a data." };
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("criar_evento", { p });
  if (error) return falha(error);
  redirect(`/eventos/${data}`);
}

export async function atualizarEvento(id: string, _: unknown, form: FormData): Promise<Resultado> {
  await exigirStaff();
  const p = dadosEvento(form);
  if (!p.titulo || !p.inicio) return { ok: false, erro: "Informe o adversário (ou o nome do show) e a data." };
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

/**
 * Salva de uma vez as cotas de um setor (e a capacidade). Remanejar é só tirar de uma área e pôr
 * em outra na mesma edição. Reduções vão primeiro, para o saldo nunca passar da capacidade no meio.
 */
export async function salvarCotas(
  evento: string, setor: string, capacidade: number, cotas: Record<string, number>, motivo: string,
): Promise<Resultado> {
  await exigirStaff();
  if (!motivo.trim()) return { ok: false, erro: "Informe o motivo da alteração (fica no histórico)." };
  const supabase = await supabaseServidor();
  const [{ data: atuais }, { data: set }] = await Promise.all([
    supabase.from("cotas").select("area_id, quantidade").eq("evento_id", evento).eq("setor", setor),
    supabase.from("evento_setores").select("capacidade, cota_por_area").eq("evento_id", evento).eq("setor", setor).single(),
  ]);
  const antes = new Map((atuais ?? []).map((c) => [c.area_id as string, c.quantidade as number]));
  const soma = Object.values(cotas).reduce((n, v) => n + v, 0);
  if (set?.cota_por_area && soma > capacidade) return { ok: false, erro: `A soma das áreas (${soma}) passa da capacidade (${capacidade}).` };
  const mudancas = Object.entries(cotas).filter(([a, v]) => v !== (antes.get(a) ?? 0)).sort((x, y) => (x[1] - (antes.get(x[0]) ?? 0)) - (y[1] - (antes.get(y[0]) ?? 0)));
  const passos: { area: string | null; qtd: number }[] = [];
  // capacidade: se diminui, depois das reduções; se aumenta, antes dos aumentos
  const capMuda = set && capacidade !== set.capacidade;
  for (const [a, v] of mudancas.filter(([a, v]) => v < (antes.get(a) ?? 0))) passos.push({ area: a, qtd: v });
  if (capMuda) passos.push({ area: null, qtd: capacidade });
  for (const [a, v] of mudancas.filter(([a, v]) => v > (antes.get(a) ?? 0))) passos.push({ area: a, qtd: v });
  for (const p of passos) {
    const { error } = await supabase.rpc("ajustar_cota", { p_evento: evento, p_setor: setor, p_area: p.area, p_quantidade: p.qtd, p_motivo: motivo });
    if (error) {
      revalidatePath(`/eventos/${evento}`, "layout");
      return falha(error);
    }
  }
  revalidatePath(`/eventos/${evento}`, "layout");
  return { ok: true, mensagem: passos.length ? `${passos.length} alteração(ões) salva(s).` : "Nada mudou." };
}
