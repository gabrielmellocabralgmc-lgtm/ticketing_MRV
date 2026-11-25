"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

const atualizar = (evento: string) => revalidatePath(`/eventos/${evento}`, "layout");

// Cancelar um ingresso (volta para o saldo)
export async function cancelarIngresso(evento: string, ingresso: string, motivo?: string): Promise<Resultado<{ status: string }>> {
  await exigirAdmin();
  const sb = await supabaseServidor();
  const { data, error } = await sb.rpc("cancelar_ingresso", {
    p_ingresso: ingresso,
    p_motivo: motivo ?? ""
  });

  if (error) return falha(error);
  atualizar(evento);
  return { ok: true, mensagem: "Ingresso cancelado. O lugar voltou para o saldo." };
}

// Buscar histórico por CPF (para pré-preenchimento)
export async function buscarHistoricoCPF(cpf: string): Promise<Resultado<{
  pessoa_id: string;
  nome: string;
  email: string;
  celular: string;
  ultimo_evento: string;
} | null>> {
  await exigirAdmin();
  const sb = await supabaseServidor();

  const { data, error } = await sb.rpc("buscar_historico_cpf", { p_cpf: cpf });

  if (error) return falha(error);
  if (!data || data.length === 0) return { ok: true, dados: null };

  const row = data[0];
  return {
    ok: true,
    mensagem: `Encontrado: ${row.nome} (${row.ultimo_evento})`,
    dados: {
      pessoa_id: row.pessoa_id,
      nome: row.nome,
      email: row.email,
      celular: row.celular,
      ultimo_evento: row.ultimo_evento,
    }
  };
}
