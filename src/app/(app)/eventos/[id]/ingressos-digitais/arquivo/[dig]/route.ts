import { NextResponse } from "next/server";
import { lerFoto } from "@/lib/fotos";
import { supabaseServidor } from "@/lib/supabase/server";

// Equipe (Admin/Marketing) abre o ingresso digital para conferir. A RLS só deixa a equipe ler.
export async function GET(_: Request, { params }: { params: Promise<{ dig: string }> }) {
  const { dig } = await params;
  if (!/^[0-9a-f-]{36}$/.test(dig)) return new NextResponse(null, { status: 404 });
  const sb = await supabaseServidor();
  const { data: d } = await sb.from("ingressos_digitais").select("evento_id, tipo, url, caminho, nome_arquivo").eq("id", dig).maybeSingle();
  if (!d) return new NextResponse("Não encontrado.", { status: 404 });
  if (d.tipo === "link") {
    const { data: ev } = await sb.from("eventos").select("resgate_unico").eq("id", d.evento_id as string).maybeSingle();
    if (ev?.resgate_unico) {
      return new NextResponse("Link de resgate de uso único: a equipe não abre este link (ele seria consumido). Só o convidado resgata, pela página pessoal.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  }
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
