import { NextResponse } from "next/server";

/** Vercel Cron envia "Authorization: Bearer $CRON_SECRET". Espaços/quebras de linha coladas sem querer são ignorados. */
export function cronNaoAutorizado(req: Request) {
  const segredo = process.env.CRON_SECRET?.trim();
  const recebido = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!segredo || recebido !== segredo) {
    return new NextResponse("Não autorizado", { status: 401 });
  }
  return null;
}
