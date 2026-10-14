import "server-only";
import { supabaseServico } from "@/lib/supabase/server";

/** Garante a conta no Supabase Auth (sem senha: acesso por magic link) e devolve o id. */
export async function garantirUsuarioAuth(email: string, nome: string): Promise<string> {
  const servico = supabaseServico();
  const criado = await servico.auth.admin.createUser({ email, email_confirm: true, user_metadata: { nome } });
  if (criado.data.user) return criado.data.user.id;
  const { data } = await servico.auth.admin.listUsers({ perPage: 1000 });
  const id = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
  if (!id) throw criado.error ?? new Error("Não foi possível criar o usuário");
  return id;
}
