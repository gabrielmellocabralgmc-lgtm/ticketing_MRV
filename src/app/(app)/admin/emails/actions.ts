"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { enviarModelo, resumoEnvio } from "@/lib/mensagens/envio";
import { EXEMPLO } from "@/lib/mensagens/modelos";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

export async function salvarModelo(chave: string, assunto: string, corpo: string): Promise<Resultado> {
  const s = await exigirStaff();
  if (!assunto.trim() || !corpo.trim()) return { ok: false, erro: "Assunto e texto não podem ficar vazios." };
  const supabase = await supabaseServidor();
  const { error } = await supabase.from("modelos_email").update({ assunto, corpo, atualizado_em: new Date().toISOString(), atualizado_por: s.userId }).eq("chave", chave);
  if (error) return falha(error);
  await supabase.rpc("registrar_auditoria", { p_acao: "alterar", p_entidade: "modelo_email", p_entidade_id: chave, p_detalhes: null });
  revalidatePath("/admin/emails");
  return { ok: true, mensagem: "Modelo salvo." };
}

/** Manda o modelo (como está na tela, mesmo sem salvar) para o próprio e-mail, com dados de exemplo. */
export async function testarModelo(chave: string, assunto: string, corpo: string): Promise<Resultado> {
  const s = await exigirStaff();
  const r = await enviarModelo([{ tipo: chave, para: { nome: s.nome, email: s.email }, vars: EXEMPLO }], { autor: s.userId, modelo: { assunto: `[TESTE] ${assunto}`, corpo } });
  revalidatePath("/admin/emails");
  return r.falhas ? { ok: false, erro: r.erros.join("; ") } : { ok: true, mensagem: `Teste para ${s.email}: ${resumoEnvio(r)}.` };
}
