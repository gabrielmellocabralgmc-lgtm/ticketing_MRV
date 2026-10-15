"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Setor } from "@/lib/tipos";
import type { PessoaForm } from "./areas/[area]/actions";

/**
 * Admin adiciona convidado vindo de WhatsApp, e-mail etc. Passa pelas mesmas regras do banco
 * (CPF válido e sem duplicidade no evento, saldo da área travado), mas sem validação: entra
 * direto como pronto para envio, abatendo da cota da área escolhida.
 */
export async function adicionarConvidadoAdmin(
  evento: string, setor: Setor, area: string, pessoas: PessoaForm[],
  semSaldo: "espera" | { doador: string | null }, origem: string,
): Promise<Resultado<{ status: string }>> {
  await exigirAdmin();
  const supabase = await supabaseServidor();
  const o = origem.trim();
  const opcoes = {
    origem: "marketing",
    avulsos: true,
    lista_espera: true,
    observacao: o || null,
    motivo: `adicionado manualmente pelo Admin${o ? ` (${o})` : ""}`,
  };
  const p_pessoas = pessoas.map((p) => ({ nome: p.nome, cpf: p.cpf, celular: p.celular, email: p.email || null }));
  const { data, error } = semSaldo === "espera"
    ? await supabase.rpc("criar_pedido", { p_evento: evento, p_setor: setor, p_area: area, p_pessoas, p_opcoes: opcoes })
    // sem saldo: o que falta sai da cota de outra área (ou do saldo livre do setor)
    : await supabase.rpc("adicionar_abatendo", { p_evento: evento, p_setor: setor, p_area: area, p_doador: semSaldo.doador, p_pessoas, p_opcoes: opcoes });
  if (error) return falha(error);
  revalidatePath(`/eventos/${evento}`);
  const status = (data as { status: string }).status;
  const n = pessoas.length;
  return {
    ok: true, dados: { status },
    mensagem: status === "lista_espera"
      ? `Sem saldo na área: ${n === 1 ? "o convidado entrou" : `os ${n} convidados entraram`} na lista de espera.`
      : `${n === 1 ? "Convidado adicionado" : `${n} convidados adicionados`} direto na lista final (pronto para envio)${semSaldo === "espera" ? "" : ", com a cota remanejada"}.`,
  };
}

/** Nome (e contato) de quem o Admin adicionou só com o CPF: pode ser informado mesmo depois do envio. */
export async function atualizarDadosAdmin(evento: string, ingresso: string, p: { nome: string; celular: string; email: string }): Promise<Resultado> {
  await exigirAdmin();
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("atualizar_dados_admin", {
    p_ingresso: ingresso, p_nome: p.nome, p_celular: p.celular || null, p_email: p.email || null,
  });
  if (error) return falha(error);
  revalidatePath(`/eventos/${evento}/lista`);
  return { ok: true, mensagem: "Dados atualizados." };
}
