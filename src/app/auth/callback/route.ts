import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServidor } from "@/lib/supabase/server";

// Destino do magic link: troca o código (PKCE) ou o token_hash pela sessão.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const nextParam = url.searchParams.get("next") ?? "/eventos";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/eventos";
  const supabase = await supabaseServidor();

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("sem código") };

  return NextResponse.redirect(new URL(error ? "/login?erro=link" : next, url.origin));
}
