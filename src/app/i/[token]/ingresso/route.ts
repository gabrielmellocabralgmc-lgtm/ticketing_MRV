import { NextResponse } from "next/server";
import { lerFoto } from "@/lib/fotos";
import { supabaseServico } from "@/lib/supabase/server";

// Link direto do ingresso digital (pelo token pessoal do convidado), válido depois de distribuído.
// Link externo: redireciona. PDF: entrega o arquivo guardado no banco.
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return new NextResponse("Link inválido", { status: 404 });
  // vale assim que o ingresso é distribuído (a equipe pode copiar e mandar por fora)
  const { data } = await (await supabaseServico()).rpc("dig_arquivo_do_token", { p_token: token });
  const ing = ((data ?? []) as { tipo: string; url: string | null; caminho: string | null; nome_arquivo: string | null }[])[0];
  if (!ing) return new NextResponse("Ingresso ainda não disponível.", { status: 404 });
  if (ing.tipo === "link" && ing.url) return NextResponse.redirect(ing.url, 302);
  const dados = ing.caminho ? await lerFoto(ing.caminho) : null;
  if (!dados) return new NextResponse("Arquivo não encontrado. Fale com o Marketing MRV.", { status: 404 });
  const nome = (ing.nome_arquivo || "ingresso.pdf").replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(new Uint8Array(dados), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
