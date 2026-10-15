import { NextResponse } from "next/server";
import { supabaseServico } from "@/lib/supabase/server";

// Verificação de saúde (Railway): o app responde e o banco também.
export const dynamic = "force-dynamic";
export async function GET() {
  const { error } = await (await supabaseServico()).from("areas").select("id").limit(1);
  return NextResponse.json({ ok: !error }, { status: error ? 503 : 200 });
}
