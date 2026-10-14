import { NextResponse } from "next/server";
import { supabaseServico } from "@/lib/supabase/server";
import { cronNaoAutorizado } from "../autorizar";

// Eventos abertos com prazo de solicitação vencido: fecha e devolve o saldo não usado ao pool.
export async function GET(req: Request) {
  const negado = cronNaoAutorizado(req);
  if (negado) return negado;
  const supabase = supabaseServico();
  await supabase.rpc("expirar_convites");
  const { data: eventos, error } = await supabase.from("eventos").select("id, titulo").eq("status", "aberto").lt("prazo_solicitacao", new Date().toISOString());
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const fechados = [];
  for (const e of eventos ?? []) {
    const { data } = await supabase.rpc("fechar_prazo", { p_evento: e.id });
    fechados.push({ evento: e.titulo, devolvidos_ao_pool: data });
  }
  return NextResponse.json({ fechados });
}
