import { NextResponse } from "next/server";
import { cronNaoAutorizado } from "../autorizar";

// Rotinas frequentes numa chamada só (Vercel Hobby: o cron da Vercel é diário, então o
// GitHub Actions chama esta rota a cada 30 min). Cada rotina é idempotente.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROTINAS = ["expirar-convites", "fechar-prazos", "encerrar-eventos", "lembretes"];

export async function GET(req: Request) {
  const negado = cronNaoAutorizado(req);
  if (negado) return negado;
  const base = new URL(req.url).origin;
  const resultado: Record<string, unknown> = {};
  for (const r of ROTINAS) {
    try {
      const res = await fetch(`${base}/api/cron/${r}`, { headers: { authorization: req.headers.get("authorization") ?? "" }, cache: "no-store" });
      resultado[r] = res.ok ? await res.json() : { erro: res.status };
    } catch (e) {
      resultado[r] = { erro: e instanceof Error ? e.message : String(e) };
    }
  }
  console.log("[cron] tudo:", JSON.stringify(resultado).slice(0, 500));
  return NextResponse.json(resultado);
}
