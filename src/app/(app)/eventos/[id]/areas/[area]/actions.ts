"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { deInputLocal } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Setor } from "@/lib/tipos";

export interface PessoaForm {
  nome: string;
  cpf: string;
  celular: string;
  email?: string;
}

const caminho = (evento: string, area: string) => `/eventos/${evento}/areas/${area}`;

/** Modo A: o responsável digita titular (+ convidados). */
export async function solicitar(evento: string, setor: Setor, area: string, pessoas: PessoaForm[], listaEspera: boolean): Promise<Resultado<{ status: string }>> {
  await exigirSessao();
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("criar_pedido", {
    p_evento: evento, p_setor: setor, p_area: area,
    p_pessoas: pessoas.map((p) => ({ nome: p.nome, cpf: p.cpf, celular: p.celular, email: p.email || null })),
    p_opcoes: { lista_espera: listaEspera, origem: "responsavel" },
  });
  if (error) return falha(error);
  revalidatePath(caminho(evento, area));
  const status = (data as { status: string }).status;
  return {
    ok: true, dados: { status },
    mensagem: status === "lista_espera"
      ? "A cota da área está esgotada: o pedido entrou na lista de espera e sobe sozinho se abrir vaga."
      : `${pessoas.length === 1 ? "Solicitação registrada" : `${pessoas.length} ingressos solicitados`}. Lembre de validar a lista quando terminar.`,
  };
}

/** Modo B: reserva vagas e gera o link para o convidado preencher. */
export async function criarConvite(evento: string, setor: Setor, area: string, _: unknown, form: FormData): Promise<Resultado<{ token: string }>> {
  await exigirSessao();
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("criar_convite", {
    p_evento: evento, p_setor: setor, p_area: area,
    p_qtd: Number(form.get("qtd") ?? 1),
    p_nome_previsto: String(form.get("nome_previsto") ?? "").trim() || null,
    p_contato: String(form.get("contato") ?? "").replace(/\D/g, "") || null,
    p_expira_em: deInputLocal(form.get("expira_em")),
  });
  if (error) return falha(error);
  revalidatePath(caminho(evento, area));
  return { ok: true, dados: { token: (data as { token: string }).token }, mensagem: "Vaga reservada. Copie o link ou envie pelo WhatsApp." };
}

export async function cancelarConvite(evento: string, area: string, convite: string): Promise<Resultado> {
  await exigirSessao();
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("cancelar_convite", { p_convite: convite });
  if (error) return falha(error);
  revalidatePath(caminho(evento, area));
  return { ok: true, mensagem: "Convite cancelado: as vagas voltaram para o saldo." };
}

export async function cancelarIngresso(evento: string, area: string, ingresso: string, motivo: string): Promise<Resultado> {
  await exigirSessao();
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("cancelar_ingressos", { p_ids: [ingresso], p_motivo: motivo || "cancelado pela área" });
  if (error) return falha(error);
  if (!data) return { ok: false, erro: "Este ingresso não pode mais ser cancelado pela área. Fale com o Marketing." };
  revalidatePath(caminho(evento, area));
  return { ok: true, mensagem: "Cancelado. O lugar voltou para o saldo (e a lista de espera foi chamada, se houver)." };
}

export async function editarPessoa(evento: string, area: string, ingresso: string, p: PessoaForm): Promise<Resultado> {
  await exigirSessao();
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("editar_pessoa_ingresso", {
    p_ingresso: ingresso, p: { nome: p.nome, cpf: p.cpf, celular: p.celular, email: p.email || null },
  });
  if (error) return falha(error);
  revalidatePath(caminho(evento, area));
  return { ok: true, mensagem: "Dados atualizados." };
}

export async function validarLista(evento: string, setor: Setor, area: string): Promise<Resultado> {
  await exigirSessao();
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("validar_lista", { p_evento: evento, p_setor: setor, p_area: area });
  if (error) return falha(error);
  revalidatePath(caminho(evento, area));
  return { ok: true, mensagem: `Lista validada: ${data} ingresso(s) seguiram para a aprovação do Marketing.` };
}
