"use server";
import { redirect } from "next/navigation";
import type { Resultado } from "@/lib/erros";
import { exigirSessao } from "@/lib/sessao";

export async function salvarSenha(_: unknown, form: FormData): Promise<Resultado> {
  const s = await exigirSessao();
  const senha = String(form.get("senha") ?? "");
  const confirmar = String(form.get("confirmar") ?? "");
  const next = String(form.get("next") ?? "");
  const { definirSenha, problemaSenha } = await import("@/lib/auth/senha");
  const problema = problemaSenha(senha, s.email);
  if (problema) return { ok: false, erro: problema };
  if (senha !== confirmar) return { ok: false, erro: "As duas senhas não são iguais." };
  await definirSenha(s.userId, senha);
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
  return { ok: true, mensagem: "Senha salva. Da próxima vez, entre com o seu e-mail e esta senha, em qualquer aparelho." };
}
