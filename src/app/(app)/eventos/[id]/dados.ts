import "server-only";
import { notFound } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Evento, Setor } from "@/lib/tipos";

export interface LinhaResumo {
  setor: Setor;
  capacidade: number;
  cota_por_area: boolean;
  area_id: string;
  area_nome: string;
  cota: number | null;
  sob_demanda: boolean;
  ocupados: number;
  em_espera: number;
  convites_aguardando: number;
  solicitados: number;
  validados: number;
  aprovados: number;
  facial_pendente: number;
  facial_ok: number;
  enviados: number;
  confirmados: number;
  presentes: number;
  no_show: number;
  ultima_validacao: string | null;
}

export interface ResumoSetor {
  setor: Setor;
  capacidade: number;
  cota_por_area: boolean;
  alocado: number;
  ocupados: number;
  em_espera: number;
}

export async function carregarEvento(id: string) {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("eventos").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return data as Evento;
}

export async function carregarResumo(id: string) {
  const supabase = await supabaseServidor();
  const [{ data: linhas }, { data: setores }] = await Promise.all([
    supabase.rpc("resumo_evento", { p_evento: id }),
    supabase.rpc("resumo_setores", { p_evento: id }),
  ]);
  return { linhas: (linhas ?? []) as LinhaResumo[], setores: (setores ?? []) as ResumoSetor[] };
}
