import { NextResponse } from "next/server";
import { supabaseServico } from "@/lib/supabase/server";
import { cronNaoAutorizado } from "../autorizar";

// Devolve ao saldo as vagas de convites (Modo B) vencidos e puxa a lista de espera.
export async function GET(req: Request) {
  const negado = cronNaoAutorizado(req);
  if (negado) return negado;
  const { data, error } = await (await supabaseServico()).rpc("expirar_convites");
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ convites_expirados: data });
}
