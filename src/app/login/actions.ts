"use server";
import { canalEmail } from "@/lib/mensagens/email";
import { htmlEmail } from "@/lib/mensagens/modelos";
import { siteUrl } from "@/lib/mensagens";
import { redirect } from "next/navigation";
import type { Resultado } from "@/lib/erros";

export async function enviarLink(_: unknown, form: FormData): Promise<Resultado> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const nextBruto = String(form.get("next") ?? "/eventos");
  const next = nextBruto.startsWith("/") && !nextBruto.startsWith("//") ? nextBruto : "/eventos";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: "Informe um e-mail válido." };
  // pedido feito: sai do formulário e mostra a tela de confirmação (sem dizer se o e-mail tem acesso)
  const resposta = (): never => redirect("/login/enviado");
  const { criarLinkAcesso } = await import("@/lib/auth/links");
  // só quem o Admin cadastrou recebe o link; a resposta é a mesma nos dois casos (não revela quem tem acesso)
  const link = await criarLinkAcesso(email, next);
  if (!link) {
    console.log(`[login] ${email}: sem perfil ativo (ou muitos pedidos em 15 min) — nenhum e-mail enviado`);
    return resposta();
  }
  const url = `${siteUrl()}/auth/callback?token=${link.token}`;
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") {
    console.log(`[login] sem RESEND_API_KEY (ambiente local): link de acesso de ${email} → ${url}`);
    return resposta();
  }
  const texto = `Olá, ${link.nome.split(" ")[0]}!\n\nUse o botão abaixo para entrar no sistema de Ingressos MRV. O link vale por 20 minutos e só pode ser usado uma vez.\n\nSe não foi você que pediu, ignore este e-mail.`;
  const r = await canalEmail().enviar({
    para: { nome: link.nome, email }, assunto: "Seu acesso ao Ingressos MRV", texto: `${texto}\n\n${url}`,
    html: htmlEmail(texto, { botao: { rotulo: "Entrar no sistema", url } }),
  });
  if (!r.ok) {
    console.error(`[login] ${email}: falha no envio pelo Resend — ${r.erro}`);
    return { ok: false, erro: "Não foi possível enviar o link agora. Tente de novo em alguns minutos." };
  }
  console.log(`[login] ${email}: link enviado pelo Resend`);
  return resposta();
}

/** Abre a sessão (cookie assinado, 30 dias) e vai para o destino. */
async function abrirSessao(uid: string, destino: string): Promise<never> {
  const { assinarSessao, COOKIE_SESSAO, DURACAO_SESSAO_S } = await import("@/lib/auth/sessao-cookie");
  const { cookies } = await import("next/headers");
  (await cookies()).set(COOKIE_SESSAO, await assinarSessao(uid), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DURACAO_SESSAO_S,
  });
  redirect(destino.startsWith("/") && !destino.startsWith("//") ? destino : "/eventos");
}

/**
 * Login com e-mail + senha (gestores, Marketing, Admin). A senha é criada no primeiro acesso pelo link.
 * Emergência: ADMIN_EMAIL + ADMIN_SENHA definidos no servidor também entram como Admin.
 */
export async function entrarComSenha(_: unknown, form: FormData): Promise<Resultado> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const next = String(form.get("next") ?? "/eventos");
  if (!email || !senha) return { ok: false, erro: "Informe o e-mail e a senha." };

  // emergência do Admin geral (variáveis do servidor)
  const senhaServidor = process.env.ADMIN_SENHA ?? "";
  const emailServidor = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (senhaServidor.length >= 12 && emailServidor && email === emailServidor) {
    const { createHash, timingSafeEqual } = await import("node:crypto");
    const h = (x: string) => createHash("sha256").update(x).digest();
    if (timingSafeEqual(h(senha), h(senhaServidor))) {
      const { pool } = await import("@/lib/db/pg");
      const { rows } = await pool().query<{ user_id: string }>(
        `select p.user_id from perfis p where lower(p.email) = $1 and p.papel = 'admin' and p.ativo limit 1`, [emailServidor]);
      if (rows[0]) {
        console.log(`[login] senha de emergência: Admin entrou`);
        return abrirSessao(rows[0].user_id, next);
      }
    }
  }

  const { entrarComSenhaDoUsuario } = await import("@/lib/auth/senha");
  const r = await entrarComSenhaDoUsuario(email, senha);
  if ("erro" in r) return { ok: false, erro: r.erro };
  return abrirSessao(r.uid, next);
}

/** Página do link: ao confirmar, "queima" o link e abre a sessão. */
export async function confirmarLink(token: string) {
  const { usarLinkAcesso } = await import("@/lib/auth/links");
  const { assinarSessao, COOKIE_SESSAO, DURACAO_SESSAO_S } = await import("@/lib/auth/sessao-cookie");
  const { cookies } = await import("next/headers");
  const { redirect } = await import("next/navigation");
  const r = await usarLinkAcesso(token);
  if (!r) return redirect("/login?erro=link");
  (await cookies()).set(COOKIE_SESSAO, await assinarSessao(r.uid), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DURACAO_SESSAO_S,
  });
  const destino = r.destino.startsWith("/") && !r.destino.startsWith("//") ? r.destino : "/eventos";
  // primeiro acesso (ainda sem senha): cria a senha antes de seguir
  const { temSenha } = await import("@/lib/auth/senha");
  if (!destino.startsWith("/conta/senha") && !(await temSenha(r.uid))) redirect(`/conta/senha?primeiro=1&next=${encodeURIComponent(destino)}`);
  redirect(destino);
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
