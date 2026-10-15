"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Setor } from "@/lib/tipos";
import type { PessoaForm } from "./areas/[area]/actions";

/** Vínculo dos convidados: alguém já na lista do jogo (ingresso) ou de fora (nome). Vazio = sem vínculo. */
export interface Anfitriao { ingresso?: string; externo?: string }

/**
 * Admin/Marketing adicionam convidados vindos de WhatsApp, e-mail etc. (um ou em massa). Passa pelas
 * regras do banco (CPF válido e sem duplicidade no evento, saldo da área travado), mas sem validação:
 * entra direto como pronto para envio, abatendo da cota da área escolhida.
 */
export async function adicionarConvidadoAdmin(
  evento: string, setor: Setor, area: string, pessoas: PessoaForm[],
  semSaldo: "espera" | { doador: string | null }, origem: string, anfitriao: Anfitriao = {},
): Promise<Resultado<{ status: string }>> {
  await exigirStaff();
  const supabase = await supabaseServidor();
  const o = origem.trim();
  const { data, error } = await supabase.rpc("adicionar_em_massa", {
    p_evento: evento, p_setor: setor, p_area: area,
    p_pessoas: pessoas.map((p) => ({ nome: p.nome, cpf: p.cpf, celular: p.celular, email: p.email || null })),
    p_anfitriao: anfitriao.ingresso || null,
    p_anfitriao_externo: anfitriao.externo?.trim() || null,
    p_doador: semSaldo === "espera" ? null : semSaldo.doador,
    // sem saldo: o que falta sai da cota de outra área (ou do saldo livre do setor)
    p_abater: semSaldo !== "espera",
    p_opcoes: { lista_espera: true, observacao: o || null, motivo: `adicionado manualmente pela equipe${o ? ` (${o})` : ""}` },
  });
  if (error) return falha(error);
  revalidatePath(`/eventos/${evento}`, "layout");
  const r = data as { status: string; anfitriao?: string | null };
  const n = pessoas.length;
  const de = r.anfitriao ? `, como convidado(s) de ${r.anfitriao}` : "";
  return {
    ok: true, dados: { status: r.status },
    mensagem: r.status === "lista_espera"
      ? `Sem saldo na área: ${n === 1 ? "o convidado entrou" : `os ${n} convidados entraram`} na lista de espera${de}.`
      : `${n === 1 ? "Convidado adicionado" : `${n} convidados adicionados`} direto na lista final (pronto para envio)${de}${semSaldo === "espera" ? "" : ", com a cota remanejada"}.`,
  };
}

/** Link para o próprio convidado preencher (entra aprovado). Vinculado a um anfitrião da lista, de fora, ou a ninguém. */
export async function gerarLinkConvidados(evento: string, f: {
  setor: Setor; area: string; qtd: number; para: string; contato: string; anfitriao: Anfitriao;
}): Promise<Resultado<{ token: string; area: string; setor: Setor }>> {
  await exigirStaff();
  const supabase = await supabaseServidor();
  const contato = f.contato.replace(/\D/g, "") || null;
  if (f.anfitriao.ingresso) {
    const { data, error } = await supabase.rpc("criar_convite_anfitriao", { p_anfitriao: f.anfitriao.ingresso, p_qtd: f.qtd, p_contato: contato });
    if (error) return falha(error);
    const { data: ing } = await supabase.from("v_ingressos").select("area_nome, setor").eq("id", f.anfitriao.ingresso).maybeSingle();
    revalidatePath(`/eventos/${evento}`, "layout");
    return { ok: true, dados: { token: (data as { token: string }).token, area: ing?.area_nome ?? "", setor: (ing?.setor ?? f.setor) as Setor } };
  }
  const externo = f.anfitriao.externo?.trim();
  const { data, error } = await supabase.rpc("criar_convite", {
    p_evento: evento, p_setor: f.setor, p_area: f.area, p_qtd: f.qtd,
    p_nome_previsto: f.para.trim() || (externo ? `Convidados de ${externo}` : null), p_contato: contato, p_expira_em: null,
  });
  if (error) return falha(error);
  const c = data as { token: string; convite_id: string };
  if (externo) await supabase.rpc("definir_anfitriao_externo", { p_convite: c.convite_id, p_nome: externo });
  const { data: a } = await supabase.from("areas").select("nome").eq("id", f.area).maybeSingle();
  revalidatePath(`/eventos/${evento}`, "layout");
  return { ok: true, dados: { token: c.token, area: a?.nome ?? "", setor: f.setor } };
}

/** Nome (e contato) de quem o Admin adicionou só com o CPF: pode ser informado mesmo depois do envio. */
export async function atualizarDadosAdmin(evento: string, ingresso: string, p: { nome: string; celular: string; email: string }): Promise<Resultado> {
  await exigirStaff();
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("atualizar_dados_admin", {
    p_ingresso: ingresso, p_nome: p.nome, p_celular: p.celular || null, p_email: p.email || null,
  });
  if (error) return falha(error);
  revalidatePath(`/eventos/${evento}`, "layout");
  return { ok: true, mensagem: "Dados atualizados." };
}
