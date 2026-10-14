"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { garantirUsuarioAuth } from "@/lib/usuarios";

export async function salvarUsuario(_: unknown, form: FormData): Promise<Resultado> {
  await exigirAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const nome = String(form.get("nome") ?? "").trim();
  const papel = String(form.get("papel") ?? "responsavel");
  const areas = form.getAll("areas").map(String);
  if (!email || !nome) return { ok: false, erro: "Informe nome e e-mail." };

  let userId: string;
  try {
    userId = await garantirUsuarioAuth(email, nome);
  } catch (e) {
    return falha(e);
  }

  const supabase = await supabaseServidor();
  const { error } = await supabase.from("perfis").upsert({ user_id: userId, nome, email, papel, ativo: true });
  if (error) return falha(error);
  await supabase.from("area_responsaveis").delete().eq("user_id", userId);
  if (papel === "responsavel" && areas.length) {
    const { error: e2 } = await supabase.from("area_responsaveis").insert(areas.map((area_id) => ({ area_id, user_id: userId })));
    if (e2) return falha(e2);
  }
  await supabase.rpc("registrar_auditoria", { p_acao: "alterar", p_entidade: "perfil", p_entidade_id: userId, p_detalhes: { email, papel, areas } });
  revalidatePath("/admin/usuarios");
  return { ok: true, mensagem: `${nome} salvo. O acesso é pelo link enviado ao e-mail na tela de login.` };
}

export async function alternarAtivo(userId: string, ativo: boolean): Promise<Resultado> {
  await exigirAdmin();
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("perfis").update({ ativo }).eq("user_id", userId);
  if (error) return falha(error);
  revalidatePath("/admin/usuarios");
  return { ok: true };
}
