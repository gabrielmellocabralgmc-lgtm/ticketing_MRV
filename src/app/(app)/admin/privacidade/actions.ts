"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

export async function salvarRetencao(_: unknown, form: FormData): Promise<Resultado> {
  await exigirAdmin();
  const meses = Number(form.get("meses"));
  if (!Number.isInteger(meses) || meses < 1 || meses > 120) return { ok: false, erro: "Use de 1 a 120 meses." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("config").update({ valor: meses }).eq("chave", "retencao_meses");
  if (error) return falha(error);
  await supabase.rpc("registrar_auditoria", { p_acao: "alterar", p_entidade: "config", p_entidade_id: "retencao_meses", p_detalhes: { meses } });
  revalidatePath("/admin/privacidade");
  return { ok: true, mensagem: `Retenção ajustada para ${meses} meses.` };
}

export async function anonimizarAgora(): Promise<Resultado> {
  await exigirAdmin();
  const { data, error } = await (await supabaseServidor()).rpc("anonimizar_por_retencao", { p_meses: null });
  if (error) return falha(error);
  revalidatePath("/admin/privacidade");
  const r = data as { pessoas: number; envios: number; walkins: number };
  return { ok: true, mensagem: `Anonimizados: ${r.pessoas} pessoa(s), ${r.envios} e-mail(s) da caixa de saída e ${r.walkins} registro(s) de entrada.` };
}

export async function anonimizarTitular(_: unknown, form: FormData): Promise<Resultado> {
  await exigirAdmin();
  const { data, error } = await (await supabaseServidor()).rpc("anonimizar_titular", { p_cpf: String(form.get("cpf") ?? "") });
  if (error) return falha(error);
  revalidatePath("/admin/privacidade");
  return { ok: true, mensagem: `Dados de ${(data as { nome: string }).nome} anonimizados.` };
}
