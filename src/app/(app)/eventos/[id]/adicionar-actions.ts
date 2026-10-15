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
  semSaldo: "espera" | "acima", origem: string,
): Promise<Resultado<{ status: string }>> {
  await exigirAdmin();
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("criar_pedido", {
    p_evento: evento, p_setor: setor, p_area: area,
    p_pessoas: pessoas.map((p) => ({ nome: p.nome, cpf: p.cpf, celular: p.celular, email: p.email || null })),
    p_opcoes: {
      origem: "marketing",
      lista_espera: semSaldo === "espera",
      ignorar_cota: semSaldo === "acima",
      observacao: origem.trim() || null,
      motivo: `adicionado manualmente pelo Admin${origem.trim() ? ` (${origem.trim()})` : ""}${semSaldo === "acima" ? " · acima da cota" : ""}`,
    },
  });
  if (error) return falha(error);
  revalidatePath(`/eventos/${evento}`);
  const status = (data as { status: string }).status;
  const n = pessoas.length;
  return {
    ok: true, dados: { status },
    mensagem: status === "lista_espera"
      ? `Sem saldo na área: ${n === 1 ? "o convidado entrou" : `os ${n} convidados entraram`} na lista de espera.`
      : `${n === 1 ? "Convidado adicionado" : `${n} convidados adicionados`} direto na lista final (pronto para envio).`,
  };
}
