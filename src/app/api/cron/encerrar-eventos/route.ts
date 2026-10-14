import { NextResponse } from "next/server";
import { supabaseServico } from "@/lib/supabase/server";
import { cronNaoAutorizado } from "../autorizar";

// 6 horas depois do início: encerra o evento (camarote sem chegada confirmada vira no-show).
export async function GET(req: Request) {
  const negado = cronNaoAutorizado(req);
  if (negado) return negado;
  const supabase = await supabaseServico();
  const limite = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { data: eventos, error } = await supabase.from("eventos").select("id, titulo").in("status", ["aberto", "fechado"]).lt("inicio", limite);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const encerrados = [];
  for (const e of eventos ?? []) {
    const { data } = await supabase.rpc("encerrar_evento", { p_evento: e.id });
    encerrados.push({ evento: e.titulo, ...(data as object) });
  }
  return NextResponse.json({ encerrados });
}
