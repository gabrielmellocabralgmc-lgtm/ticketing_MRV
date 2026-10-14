import { NextResponse } from "next/server";
import { supabaseServico } from "@/lib/supabase/server";
import { cronNaoAutorizado } from "../autorizar";

// Diário: anonimiza dados pessoais vencidos pela política de retenção (config.retencao_meses).
export async function GET(req: Request) {
  const negado = cronNaoAutorizado(req);
  if (negado) return negado;
  const { data, error } = await (await supabaseServico()).rpc("anonimizar_por_retencao", { p_meses: null });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}
