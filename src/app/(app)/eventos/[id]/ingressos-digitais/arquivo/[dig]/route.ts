import { NextResponse } from "next/server";
import { lerFoto } from "@/lib/fotos";
import { supabaseServidor } from "@/lib/supabase/server";

// Equipe (Admin/Marketing) abre o ingresso digital para conferir. A RLS só deixa a equipe ler.
export async function GET(_: Request, { params }: { params: Promise<{ dig: string }> }) {
  const { dig } = await params;
  if (!/^[0-9a-f-]{36}$/.test(dig)) return new NextResponse(null, { status: 404 });
  const { data: d } = await (await supabaseServidor()).from("ingressos_digitais").select("tipo, url, caminho, nome_arquivo").eq("id", dig).maybeSingle();
  if (!d) return new NextResponse("Não encontrado.", { status: 404 });
  if (d.tipo === "link" && d.url) return NextResponse.redirect(d.url as string, 302);
  const dados = d.caminho ? await lerFoto(d.caminho as string) : null;
  if (!dados) return new NextResponse("Arquivo não encontrado.", { status: 404 });
  return new NextResponse(new Uint8Array(dados), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${String(d.nome_arquivo || "ingresso.pdf").replace(/[^\w.\- ]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
