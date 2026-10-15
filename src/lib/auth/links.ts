import "server-only";
// Login por link enviado por e-mail (Resend). O token vale 20 minutos e uma vez só;
// no banco fica só o hash dele.
import { createHash, randomBytes } from "node:crypto";
import { pool } from "@/lib/db/pg";

const VALIDADE_MIN = 20;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Gera o link para um usuário com perfil ativo; null se o e-mail não tem acesso. */
export async function criarLinkAcesso(email: string, destino: string): Promise<{ token: string; nome: string } | null> {
  const { rows } = await pool().query<{ user_id: string; nome: string }>(
    `select p.user_id, p.nome from perfis p join auth.users u on u.id = p.user_id where lower(p.email) = lower($1) and p.ativo limit 1`, [email]);
  if (!rows[0]) return null;
  // limite simples contra abuso: no máximo 5 links por pessoa a cada 15 minutos
  const { rows: rec } = await pool().query<{ n: number }>(
    `select count(*)::int n from acesso_links where user_id = $1 and criado_em > now() - interval '15 minutes'`, [rows[0].user_id]);
  if ((rec[0]?.n ?? 0) >= 5) return null;
  const token = randomBytes(32).toString("base64url");
  await pool().query(
    `insert into acesso_links (user_id, token_hash, destino, expira_em) values ($1, $2, $3, now() + make_interval(mins => $4))`,
    [rows[0].user_id, hash(token), destino, VALIDADE_MIN]);
  return { token, nome: rows[0].nome };
}

/** Confere e "queima" o token; devolve o usuário e para onde ir. */
export async function usarLinkAcesso(token: string): Promise<{ uid: string; destino: string } | null> {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const { rows } = await pool().query<{ user_id: string; destino: string }>(
    `update acesso_links l set usado_em = now()
     from perfis p
     where l.token_hash = $1 and l.usado_em is null and l.expira_em > now() and p.user_id = l.user_id and p.ativo
     returning l.user_id, l.destino`, [hash(token)]);
  return rows[0] ? { uid: rows[0].user_id, destino: rows[0].destino } : null;
}
