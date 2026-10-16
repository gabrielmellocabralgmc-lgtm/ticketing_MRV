"use server";
import { canalEmail } from "@/lib/mensagens/email";
import { htmlEmail } from "@/lib/mensagens/modelos";
import { siteUrl } from "@/lib/mensagens";
import type { Resultado } from "@/lib/erros";

export async function enviarLink(_: unknown, form: FormData): Promise<Resultado> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const nextBruto = String(form.get("next") ?? "/eventos");
  const next = nextBruto.startsWith("/") && !nextBruto.startsWith("//") ? nextBruto : "/eventos";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, erro: "Informe um e-mail válido." };
  const resposta = { ok: true as const, mensagem: `Se ${email} tiver acesso, o link chega em instantes. Confira também o spam.` };
  const { criarLinkAcesso } = await import("@/lib/auth/links");
  // só quem o Admin cadastrou recebe o link; a resposta é a mesma nos dois casos (não revela quem tem acesso)
  const link = await criarLinkAcesso(email, next);
  if (!link) {
    console.log(`[login] ${email}: sem perfil ativo (ou muitos pedidos em 15 min) — nenhum e-mail enviado`);
    return resposta;
  }
  const url = `${siteUrl()}/auth/callback?token=${link.token}`;
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV !== "production") {
    console.log(`[login] sem RESEND_API_KEY (ambiente local): link de acesso de ${email} → ${url}`);
    return resposta;
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
  return resposta;
}

/**
 * Acesso de emergência do Admin geral (enquanto o e-mail não está configurado): e-mail = ADMIN_EMAIL
 * e senha = ADMIN_SENHA, definidos no servidor. Sem ADMIN_SENHA, essa opção não existe.
 */
export async function entrarComSenha(_: unknown, form: FormData): Promise<Resultado> {
  const senhaServidor = process.env.ADMIN_SENHA ?? "";
  const emailServidor = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (senhaServidor.length < 12 || !emailServidor) return { ok: false, erro: "Acesso por senha desativado." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const h = (x: string) => createHash("sha256").update(x).digest();
  const ok = timingSafeEqual(h(email), h(emailServidor)) && timingSafeEqual(h(senha), h(senhaServidor));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 1500)); // atrasa tentativas
    console.log(`[login] senha: tentativa recusada para ${email || "(vazio)"}`);
    return { ok: false, erro: "E-mail ou senha incorretos." };
  }
  const { pool } = await import("@/lib/db/pg");
  const { rows } = await pool().query<{ user_id: string }>(
    `select p.user_id from perfis p where lower(p.email) = $1 and p.papel = 'admin' and p.ativo limit 1`, [emailServidor]);
  if (!rows[0]) return { ok: false, erro: "Admin não encontrado. Confira o ADMIN_EMAIL e faça um novo deploy." };
  const { assinarSessao, COOKIE_SESSAO, DURACAO_SESSAO_S } = await import("@/lib/auth/sessao-cookie");
  const { cookies } = await import("next/headers");
  const { redirect } = await import("next/navigation");
  (await cookies()).set(COOKIE_SESSAO, await assinarSessao(rows[0].user_id), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: DURACAO_SESSAO_S,
  });
  console.log(`[login] senha: Admin entrou`);
  const next = String(form.get("next") ?? "/eventos");
  return redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/eventos");
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
  redirect(r.destino.startsWith("/") && !r.destino.startsWith("//") ? r.destino : "/eventos");
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
