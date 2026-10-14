"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { normalizarTexto } from "@/lib/texto";
import { garantirUsuarioAuth } from "@/lib/usuarios";

const slug = (nome: string) => normalizarTexto(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function salvarArea(id: string | null, _: unknown, form: FormData): Promise<Resultado> {
  await exigirStaff();
  const nome = String(form.get("nome") ?? "").trim();
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("salvar_area", {
    p_id: id, p_nome: nome, p_slug: slug(nome),
    p_centro_custo: String(form.get("centro_custo") ?? ""),
    p_ativo: id ? form.get("ativo") === "on" : true,
  });
  if (error) return falha(error);
  revalidatePath("/admin/areas");
  return { ok: true, mensagem: id ? "Área atualizada." : `Área ${nome} criada. Defina a cota dela em cada evento.` };
}

export async function adicionarResponsavel(area: string, _: unknown, form: FormData): Promise<Resultado> {
  await exigirStaff();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const nome = String(form.get("nome") ?? "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: "E-mail inválido." };
  if (!nome) return { ok: false, erro: "Informe o nome." };
  try {
    const userId = await garantirUsuarioAuth(email, nome);
    const supabase = await supabaseServidor();
    const { error } = await supabase.rpc("adicionar_responsavel", { p_area: area, p_user: userId, p_nome: nome, p_email: email });
    if (error) return falha(error);
  } catch (e) {
    return falha(e);
  }
  revalidatePath("/admin/areas");
  return { ok: true, mensagem: `${nome} agora responde pela área. O acesso é pelo link enviado ao e-mail na tela de login.` };
}

export async function removerResponsavel(area: string, user: string): Promise<Resultado> {
  await exigirStaff();
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("remover_responsavel", { p_area: area, p_user: user });
  if (error) return falha(error);
  revalidatePath("/admin/areas");
  return { ok: true };
}

type Padrao = Record<"jogo" | "show", Record<string, { capacidade: number; cota_por_area?: boolean; areas: Record<string, number | { quantidade: number; sob_demanda?: boolean }> }>>;

/** Cotas padrão aplicadas a cada evento novo (config.cotas_padrao). Eventos já criados não mudam. */
export async function salvarCotasPadrao(_: unknown, form: FormData): Promise<Resultado> {
  const s = await exigirStaff();
  if (s.papel !== "admin") return { ok: false, erro: "Só o Admin altera as cotas padrão." };
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("config").select("valor").eq("chave", "cotas_padrao").single();
  const padrao = structuredClone(data!.valor) as Padrao;
  const num = (k: string) => { const v = Number(form.get(k)); return Number.isInteger(v) && v >= 0 ? v : null; };
  for (const [tipo, setor] of [["jogo", "arquibancada"], ["show", "pista"]] as const) {
    const cfg = padrao[tipo][setor];
    const cap = num(`cap-${tipo}-${setor}`);
    if (cap !== null) cfg.capacidade = cap;
    for (const [chave] of form.entries()) {
      const m = chave.match(new RegExp(`^cota-${tipo}-(.+)$`));
      if (!m) continue;
      const v = num(chave);
      if (v === null) continue;
      const atual = cfg.areas[m[1]];
      if (v === 0) delete cfg.areas[m[1]];
      else cfg.areas[m[1]] = typeof atual === "object" ? { ...atual, quantidade: v } : v;
    }
    const soma = Object.values(cfg.areas).reduce<number>((n, x) => n + (typeof x === "object" ? x.quantidade : x), 0);
    if (soma > cfg.capacidade) return { ok: false, erro: `${setor === "arquibancada" ? "Arquibancada" : "Pista"}: a soma das áreas (${soma}) passa da capacidade (${cfg.capacidade}).` };
  }
  for (const tipo of ["jogo", "show"] as const) {
    const cap = num(`cap-${tipo}-camarote`);
    if (cap !== null) padrao[tipo].camarote.capacidade = cap;
  }
  const { error } = await supabase.from("config").update({ valor: padrao }).eq("chave", "cotas_padrao");
  if (error) return falha(error);
  await supabase.rpc("registrar_auditoria", { p_acao: "alterar", p_entidade: "config", p_entidade_id: "cotas_padrao", p_detalhes: null });
  revalidatePath("/admin/areas");
  return { ok: true, mensagem: "Cotas padrão salvas. Valem para os próximos eventos criados." };
}
