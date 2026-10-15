import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO } from "@/lib/auth/sessao-cookie";
import { COOKIE_DEMO, MODO_DEMO } from "@/lib/demo/constantes";

// Manda para /login quem não tem sessão nas áreas internas. A assinatura do cookie é conferida
// no servidor a cada acesso ao banco (src/lib/supabase/server.ts): cookie falso não lê nada.
const PUBLICAS = ["/login", "/auth", "/i/", "/img/", "/api/cron", "/api/saude"];

export function middleware(request: NextRequest) {
  const caminho = request.nextUrl.pathname;
  const temSessao = !!request.cookies.get(MODO_DEMO ? COOKIE_DEMO : COOKIE_SESSAO)?.value;
  if (!temSessao && !PUBLICAS.some((p) => caminho.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(caminho + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webmanifest)$).*)"],
};
