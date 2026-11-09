import "server-only";
// Senha dos usuários internos (gestores, Marketing, Admin). Só o hash fica no banco:
// scrypt com sal aleatório, no formato "scrypt$<sal>$<hash>" (base64url).
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { pool } from "@/lib/db/pg";

const scrypt = promisify(scryptCb) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>;
const TAMANHO = 64;
export const MIN_SENHA = 8;
const MAX_FALHAS = 8; // por e-mail, a cada 15 minutos

export async function gerarHash(senha: string) {
  const sal = randomBytes(16);
  const h = await scrypt(senha, sal, TAMANHO);
  return `scrypt$${sal.toString("base64url")}$${h.toString("base64url")}`;
}

export async function conferirHash(senha: string, guardado: string) {
  const [alg, sal, h] = guardado.split("$");
  if (alg !== "scrypt" || !sal || !h) return false;
  const esperado = Buffer.from(h, "base64url");
  const calculado = await scrypt(senha, Buffer.from(sal, "base64url"), esperado.length);
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** Problema da senha nova, ou null se estiver boa. */
export function problemaSenha(senha: string, email?: string) {
  if (senha.length < MIN_SENHA) return `A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`;
  if (senha.length > 200) return "Senha longa demais.";
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return "Use letras e números na senha.";
  if (email && senha.toLowerCase().includes(email.split("@")[0].toLowerCase())) return "A senha não pode conter o seu e-mail.";
  return null;
}

export async function temSenha(uid: string) {
  const { rows } = await pool().query(`select 1 from credenciais where user_id = $1`, [uid]);
  return rows.length > 0;
}

export async function definirSenha(uid: string, senha: string) {
  await pool().query(
    `insert into credenciais (user_id, senha_hash) values ($1, $2)
     on conflict (user_id) do update set senha_hash = excluded.senha_hash, atualizado_em = now()`, [uid, await gerarHash(senha)]);
}

/**
 * Login por e-mail + senha. Devolve o usuário, ou um erro. Muitas falhas seguidas no mesmo e-mail
 * travam por 15 minutos (a pessoa ainda pode entrar pelo link do e-mail).
 */
export async function entrarComSenhaDoUsuario(email: string, senha: string): Promise<{ uid: string } | { erro: string }> {
  const e = email.trim().toLowerCase();
  const { rows: falhas } = await pool().query<{ n: number }>(
    `select count(*)::int n from login_tentativas where lower(email) = $1 and not ok and em > now() - interval '15 minutes'`, [e]);
  if ((falhas[0]?.n ?? 0) >= MAX_FALHAS) {
    return { erro: "Muitas tentativas erradas. Aguarde 15 minutos ou entre pelo link do e-mail (“Esqueci a senha”)." };
  }
  const { rows } = await pool().query<{ user_id: string; senha_hash: string | null }>(
    `select p.user_id, c.senha_hash from perfis p left join credenciais c on c.user_id = p.user_id
     where lower(p.email) = $1 and p.ativo limit 1`, [e]);
  const u = rows[0];
  const ok = !!u?.senha_hash && (await conferirHash(senha, u.senha_hash));
  await pool().query(`insert into login_tentativas (email, ok) values ($1, $2)`, [e, ok]);
  if (ok) return { uid: u!.user_id };
  await new Promise((r) => setTimeout(r, 800)); // atrasa quem tenta adivinhar
  // mesma resposta para e-mail sem cadastro, sem senha ou senha errada (não revela quem tem acesso)
  return { erro: "E-mail ou senha incorretos. É o seu primeiro acesso? Use “Primeiro acesso ou esqueci a senha”." };
}
