"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROTULO_SETOR, type Setor } from "@/lib/tipos";
import { dataHora, deInputLocal } from "@/lib/formato";
import { linkTorcedor } from "@/lib/mensagens";
import { avisarAprovadosDoEvento, enviarModelo, resumoEnvio, varsEvento, type EventoVars } from "@/lib/mensagens/envio";

export interface PessoaForm {
  nome: string;
  cpf: string;
  celular: string;
  email?: string;
}

const caminho = (evento: string, area: string) => `/eventos/${evento}/areas/${area}`;

/** Modo A: o responsável digita titular (+ convidados). */
export async function solicitar(evento: string, setor: Setor, area: string, pessoas: PessoaForm[], listaEspera: boolean): Promise<Resultado<{ status: string }>> {
  const s = await exigirSessao();
  const supabase = await supabaseServidor();
  const { data, error } = await supabase.rpc("criar_pedido", {
    p_evento: evento, p_setor: setor, p_area: area,
    p_pessoas: pessoas.map((p) => ({ nome: p.nome, cpf: p.cpf, celular: p.celular, email: p.email || null })),
    // Marketing/Admin não passam por validação nem aprovação: já entra aprovado
    p_opcoes: { lista_espera: listaEspera, origem: s.staff ? "marketing" : "responsavel" },
  });
  if (error) return falha(error);
  revalidatePath(caminho(evento, area));
  const status = (data as { status: string }).status;
  if (status === "aprovado") await avisarAprovadosDoEvento(evento, s.userId);
  const qtd = pessoas.length === 1 ? "1 convidado adicionado" : `${pessoas.length} convidados adicionados`;
  return {
    ok: true, dados: { status },
    mensagem: status === "lista_espera"
      ? "A cota da área está esgotada: o pedido entrou na lista de espera e sobe sozinho se abrir vaga."
      : `${qtd} e já validado(s): pronto(s) para envio. Dá para trocar ou cancelar até o fim do prazo de solicitação.`,
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
  const { token, expira_em } = data as { token: string; expira_em: string };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  let aviso = "Vaga reservada. Copie o link ou envie pelo WhatsApp.";
  if (email) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: true, dados: { token }, mensagem: "Vaga reservada, mas o e-mail é inválido: mande o link pelo WhatsApp." };
    const s = await exigirSessao();
    const [{ data: ev }, { data: ar }] = await Promise.all([
      supabase.from("eventos").select("id, titulo, inicio, abertura_portoes, prazo_solicitacao, prazo_validacao").eq("id", evento).single(),
      supabase.from("areas").select("nome").eq("id", area).single(),
    ]);
    const qtd = Number(form.get("qtd") ?? 1);
    const nome = String(form.get("nome_previsto") ?? "").trim().split(/[\s–-]+/)[0] || null;
    const r = await enviarModelo([{
      tipo: "convite_convidado", para: { nome, email }, evento_id: evento, area_id: area,
      vars: { ...varsEvento(ev as EventoVars), nome, area: ar?.nome, setor: ROTULO_SETOR[setor], lugares: qtd === 1 ? "1 lugar" : `${qtd} lugares`, validade: dataHora(expira_em), link: linkTorcedor(token) },
      botao: { rotulo: "Preencher meus dados", url: linkTorcedor(token) },
    }], { autor: s.userId });
    aviso = `Vaga reservada. Convite por e-mail: ${resumoEnvio(r)}.`;
  }
  return { ok: true, dados: { token }, mensagem: aviso };
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
  return { ok: true, mensagem: `Lista validada: ${data} convidado(s) validados, prontos para envio.` };
}
