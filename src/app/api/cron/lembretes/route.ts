import { NextResponse } from "next/server";
import { executarLembretes } from "@/lib/mensagens/envio";
import { cronNaoAutorizado } from "../autorizar";

// Lembretes às áreas (perto do prazo) e aos convidados com a facial pendente (D-2 e D-1).
export async function GET(req: Request) {
  const negado = cronNaoAutorizado(req);
  if (negado) return negado;
  return NextResponse.json(await executarLembretes());
}
