import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_DEMO, MODO_DEMO } from "@/lib/demo/constantes";

// Renova a sessão do Supabase e manda para /login quem não estiver logado nas áreas internas.
const PUBLICAS = ["/login", "/auth", "/i/", "/img/", "/api/cron"];

export async function middleware(request: NextRequest) {
  if (MODO_DEMO) {
    const caminho = request.nextUrl.pathname;
    if (!request.cookies.get(COOKIE_DEMO) && !PUBLICAS.some((p) => caminho.startsWith(p))) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(caminho + request.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();

  const caminho = request.nextUrl.pathname;
  if (!user && !PUBLICAS.some((p) => caminho.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(caminho + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webmanifest)$).*)"],
};
