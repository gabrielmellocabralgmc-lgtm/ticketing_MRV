"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

/**
 * Marca (ou desfaz) a chegada no camarote. Não mexe no status nem no envio do ingresso.
 * `em`: horário do celular, para confirmações feitas sem internet e enviadas depois.
 */
export async function registrarChegada(ingresso: string, chegou: boolean, em?: string): Promise<Resultado<{ em: string | null }>> {
  await exigirSessao();
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("registrar_chegada", { p_ingresso: ingresso, p_chegou: chegou, p_em: em ?? null });
  if (error) return falha(error);
  return { ok: true, dados: { em: (data as string | null) ?? null } };
}

/** Pessoa que chegou e não está na lista: fica aguardando a liberação do Marketing. */
export async function registrarWalkin(evento: string, d: { nome: string; cpf: string; anfitriao: string | null; anfitriaoTexto: string; observacao: string }): Promise<Resultado> {
  await exigirSessao();
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("registrar_walkin", {
    p_evento: evento, p_nome: d.nome, p_cpf: d.cpf || null, p_anfitriao: d.anfitriao, p_anfitriao_texto: d.anfitriaoTexto || null, p_observacao: d.observacao || null,
  });
  if (error) return falha(error);
  revalidatePath("/operacao");
  return { ok: true, mensagem: "Registrado. O Marketing precisa liberar a entrada no painel do jogo." };
}
