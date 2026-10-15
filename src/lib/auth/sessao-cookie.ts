// Sessão própria (sem Supabase Auth): cookie assinado com HMAC-SHA256 usando AUTH_SECRET.
// Funciona no middleware (edge) e no servidor (Node): só usa Web Crypto.
export const COOKIE_SESSAO = "mrv_sessao";
export const DURACAO_SESSAO_S = 30 * 24 * 3600; // 30 dias

const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function chave() {
  const segredo = process.env.AUTH_SECRET;
  if (!segredo || segredo.length < 32) throw new Error("AUTH_SECRET não configurado (mínimo 32 caracteres)");
  return crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** "uid.expira" + "." + assinatura */
export async function assinarSessao(uid: string, agora = Date.now()) {
  const corpo = `${uid}.${Math.floor(agora / 1000) + DURACAO_SESSAO_S}`;
  const sig = await crypto.subtle.sign("HMAC", await chave(), enc.encode(corpo));
  return `${corpo}.${b64url(sig)}`;
}

/** Devolve o uid se o cookie for válido e não tiver expirado. */
export async function verificarSessao(valor: string | undefined | null, agora = Date.now()): Promise<string | null> {
  if (!valor) return null;
  const partes = valor.split(".");
  if (partes.length !== 3) return null;
  const [uid, exp, sig] = partes;
  if (!/^[0-9a-f-]{36}$/.test(uid) || !/^\d+$/.test(exp) || Number(exp) * 1000 < agora) return null;
  try {
    const ok = await crypto.subtle.verify("HMAC", await chave(), deB64url(sig), enc.encode(`${uid}.${exp}`));
    return ok ? uid : null;
  } catch {
    return null;
  }
}
