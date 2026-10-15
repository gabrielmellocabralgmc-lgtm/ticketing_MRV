"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

export interface ItemForm { id: string | null; momento: "antes" | "depois"; secao: string; texto: string; dica: string; ordem: number; ativo: boolean }
export interface BebidaForm { id: string | null; nome: string; unidade: string; ordem: number; ativo: boolean }

export async function salvarItem(i: ItemForm): Promise<Resultado> {
  await exigirAdmin();
  const { error } = await (await supabaseServidor()).rpc("op_salvar_item", {
    p_id: i.id, p_momento: i.momento, p_secao: i.secao, p_texto: i.texto, p_dica: i.dica || null, p_ordem: i.ordem, p_ativo: i.ativo,
  });
  if (error) return falha(error);
  revalidatePath("/admin/operacao");
  return { ok: true, mensagem: "Item salvo." };
}

export async function salvarBebida(b: BebidaForm): Promise<Resultado> {
  await exigirAdmin();
  const { error } = await (await supabaseServidor()).rpc("op_salvar_bebida", { p_id: b.id, p_nome: b.nome, p_unidade: b.unidade, p_ordem: b.ordem, p_ativo: b.ativo });
  if (error) return falha(error);
  revalidatePath("/admin/operacao");
  return { ok: true, mensagem: "Bebida salva." };
}
