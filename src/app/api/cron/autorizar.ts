import { NextResponse } from "next/server";

/** Vercel Cron envia "Authorization: Bearer $CRON_SECRET". */
export function cronNaoAutorizado(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return new NextResponse("Não autorizado", { status: 401 });
  }
  return null;
}
