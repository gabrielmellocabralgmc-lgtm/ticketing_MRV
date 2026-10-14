"use server";
import { falha, type Resultado } from "@/lib/erros";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

/** Marca (ou desfaz) a chegada no camarote. Não mexe no status nem no envio do ingresso. */
export async function registrarChegada(ingresso: string, chegou: boolean): Promise<Resultado<{ em: string | null }>> {
  await exigirSessao();
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("registrar_chegada", { p_ingresso: ingresso, p_chegou: chegou });
  if (error) return falha(error);
  return { ok: true, dados: { em: (data as string | null) ?? null } };
}
