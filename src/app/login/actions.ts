"use server";
import { supabaseServidor } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/mensagens";
import type { Resultado } from "@/lib/erros";

export async function enviarLink(_: unknown, form: FormData): Promise<Resultado> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const next = String(form.get("next") ?? "/eventos");
  if (!email) return { ok: false, erro: "Informe o e-mail." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // só usuários já cadastrados pelo Admin recebem o link
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next.startsWith("/") ? next : "/eventos")}`,
    },
  });
  // Mesma resposta para e-mail cadastrado ou não (não revela quem tem acesso)
  if (error && !/signups not allowed|not found|user/i.test(error.message)) {
    return { ok: false, erro: "Não foi possível enviar o link agora. Tente de novo em alguns minutos." };
  }
  return { ok: true, mensagem: `Se ${email} tiver acesso, o link chega em instantes. Confira também o spam.` };
}

/** Modo demonstração: entra como um usuário do seed, sem e-mail. */
export async function entrarDemo(form: FormData) {
  const { MODO_DEMO, COOKIE_DEMO } = await import("@/lib/demo/constantes");
  if (!MODO_DEMO) return;
  const { cookies } = await import("next/headers");
  const { redirect } = await import("next/navigation");
  (await cookies()).set(COOKIE_DEMO, String(form.get("usuario")), { httpOnly: true, sameSite: "lax", path: "/" });
  const next = String(form.get("next") ?? "/eventos");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/eventos");
}
