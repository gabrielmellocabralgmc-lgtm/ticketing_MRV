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
