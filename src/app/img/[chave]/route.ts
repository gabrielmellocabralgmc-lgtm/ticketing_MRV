import { NextResponse } from "next/server";
import { supabaseServico } from "@/lib/supabase/server";

// Imagens do layout (foto do login, escudos). Públicas: não são dados pessoais.
export async function GET(_: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(chave)) return new NextResponse(null, { status: 404 });
  const { data } = await (await supabaseServico()).rpc("ler_imagem", { p_chave: chave });
  const img = (data as { mime: string; base64: string; atualizado_em: string }[] | null)?.[0];
  if (!img) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(Buffer.from(img.base64, "base64")), {
    headers: {
      "Content-Type": img.mime,
      // a URL leva ?v=<atualizado_em>, então pode ficar em cache por bastante tempo
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
