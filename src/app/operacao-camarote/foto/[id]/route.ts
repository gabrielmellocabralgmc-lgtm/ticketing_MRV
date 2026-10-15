import { NextResponse } from "next/server";
import { lerFoto } from "@/lib/fotos";
import { supabaseServidor } from "@/lib/supabase/server";

// Fotos da operação: só para quem a RLS deixa ler o registro (Operação do camarote e Admin).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse(null, { status: 404 });
  const { data: foto } = await (await supabaseServidor()).from("op_fotos").select("caminho, mime").eq("id", id).maybeSingle();
  if (!foto) return new NextResponse(null, { status: 404 });
  const dados = await lerFoto(foto.caminho as string);
  if (!dados) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(dados), {
    headers: {
      "Content-Type": foto.mime as string,
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
