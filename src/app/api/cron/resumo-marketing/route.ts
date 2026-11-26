import { NextResponse } from "next/server";
import { executarResumoMarketing } from "@/lib/mensagens/envio";
import { cronNaoAutorizado } from "../autorizar";

// Resumo do jogo ao time de Marketing: 36h antes e a atualização final 24h antes.
export async function GET(req: Request) {
  const negado = cronNaoAutorizado(req);
  if (negado) return negado;
  return NextResponse.json(await executarResumoMarketing());
}
