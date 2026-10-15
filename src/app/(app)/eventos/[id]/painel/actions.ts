"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

// ---------------------------------------------------------------- camarote: entradas fora da lista

const atualizar = (evento: string) => revalidatePath(`/eventos/${evento}`, "layout");

export async function decidirWalkin(evento: string, walkin: string, aprovar: boolean): Promise<Resultado> {
  await exigirStaff();
  const { error } = await (await supabaseServidor()).rpc("decidir_walkin", { p_walkin: walkin, p_aprovar: aprovar });
  if (error) return falha(error);
  atualizar(evento);
  return { ok: true, mensagem: aprovar ? "Entrada aprovada: a pessoa já aparece como chegou." : "Entrada recusada." };
}

export async function encerrarEvento(evento: string): Promise<Resultado> {
  await exigirStaff();
  const { data, error } = await (await supabaseServidor()).rpc("encerrar_evento", { p_evento: evento });
  if (error) return falha(error);
  atualizar(evento);
  const r = data as { presentes: number; no_show: number };
  return { ok: true, mensagem: `Evento encerrado: ${r.presentes} presente(s) e ${r.no_show} no-show no camarote.` };
}
