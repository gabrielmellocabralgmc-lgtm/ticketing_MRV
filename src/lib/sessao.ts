import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Papel } from "@/lib/tipos";

export interface Sessao {
  userId: string;
  nome: string;
  email: string;
  papel: Papel;
  areas: { id: string; nome: string }[];
  staff: boolean;
}

/** Usuário logado + perfil. Redireciona para /login (sem sessão) ou /sem-acesso (sem perfil ativo). */
export const exigirSessao = cache(async (): Promise<Sessao> => {
  const supabase = await supabaseServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("perfis").select("nome, email, papel, ativo").eq("user_id", user.id).maybeSingle();
  if (!perfil?.ativo) redirect("/sem-acesso");
  const { data: resp } = await supabase.from("area_responsaveis").select("areas(id, nome, ordem)").eq("user_id", user.id);
  const areas = (resp ?? [])
    .map((r) => r.areas as unknown as { id: string; nome: string; ordem: number })
    .filter(Boolean)
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ id, nome }) => ({ id, nome }));
  return {
    userId: user.id, nome: perfil.nome, email: perfil.email, papel: perfil.papel as Papel, areas,
    staff: perfil.papel === "admin" || perfil.papel === "marketing",
  };
});

export async function exigirStaff() {
  const s = await exigirSessao();
  if (!s.staff) redirect("/eventos");
  return s;
}

export async function exigirAdmin() {
  const s = await exigirSessao();
  if (s.papel !== "admin") redirect("/eventos");
  return s;
}
