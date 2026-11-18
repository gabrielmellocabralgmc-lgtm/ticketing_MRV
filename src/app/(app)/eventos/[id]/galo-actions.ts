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
  return { ok: true, mensagem: "Ingresso cancelado. O saldo foi devolvido à área." };
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

// Reservar N ingressos (cria com status "reservado")
// Camarote: sem cota e sem área; outros setores: com cota por área
export async function reservarIngressos(
  evento: string,
  setor: "camarote" | "arquibancada" | "pista",
  area: string,
  qtd: number,
  motivo?: string
): Promise<Resultado<{ criados: number }>> {
  await exigirAdmin();
  const sb = await supabaseServidor();

  const { data, error } = await sb.rpc("reservar_ingressos", {
    p_evento: evento,
    p_setor: setor,
    p_area_id: area || null,
    p_qtd: qtd,
    p_motivo: motivo ?? "Reserva do Admin",
    p_sem_validar_cota: !area // Camarote (sem área): sem validação de cota
  });

  if (error) return falha(error);
  const rows = data as Array<{ ingresso_id: string }>;
  atualizar(evento);
  return {
    ok: true,
    mensagem: `${qtd} ingresso(s) reservado(s). Clique em uma linha e selecione "Alocar" para atribuir à pessoa.`,
    dados: { criados: rows.length }
  };
}
