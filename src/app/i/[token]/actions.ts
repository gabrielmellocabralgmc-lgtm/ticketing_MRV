"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { avisarAprovados, avisarValidacaoPendente } from "@/lib/mensagens/envio";
import { supabaseServico } from "@/lib/supabase/server";

// Páginas públicas: o token (aleatório, 244 bits) é a credencial. As funções do banco só
// aceitam a ação certa para o status atual daquele ingresso.
const tokenValido = (t: string) => /^[A-Za-z0-9_-]{30,60}$/.test(t);

export async function preencherConvite(token: string, pessoas: { nome: string; cpf: string; celular: string; email?: string }[], aceite: boolean): Promise<Resultado> {
  if (!tokenValido(token)) return { ok: false, erro: "Link inválido." };
  const { data, error } = await (await supabaseServico()).rpc("preencher_convite", {
    p_token: token,
    p_pessoas: pessoas.map((p) => ({ nome: p.nome, cpf: p.cpf, celular: p.celular, email: p.email || null })),
    p_aceite_privacidade: aceite,
  });
  if (error) return falha(error);
  // convidados do anfitrião do camarote entram aprovados: já recebem o passo a passo do Galo ID
  const tokens = ((data as { ingressos?: { token: string }[] } | null)?.ingressos ?? []).map((i) => i.token);
  if (tokens.length) {
    const { data: ings } = await (await supabaseServico()).from("ingressos").select("id").in("token", tokens).eq("status", "aprovado");
    if (ings?.length) await avisarAprovados(ings.map((i) => i.id as string));
    // modo convidado: avisa o gestor da área que há lista para validar (no máximo a cada 12 h)
    const { data: pend } = await (await supabaseServico()).from("ingressos").select("evento_id, area_id").in("token", tokens).eq("status", "solicitado").limit(1);
    if (pend?.length) await avisarValidacaoPendente(pend[0].evento_id as string, pend[0].area_id as string).catch(() => null);
  }
  revalidatePath(`/i/${token}`);
  return { ok: true };
}

export async function acaoTorcedor(token: string, acao: "facial_ok" | "recebido" | "cancelar"): Promise<Resultado> {
  if (!tokenValido(token)) return { ok: false, erro: "Link inválido." };
  const { error } = await (await supabaseServico()).rpc("acao_torcedor", { p_token: token, p_acao: acao });
  if (error) return falha(error);
  revalidatePath(`/i/${token}`);
  return { ok: true };
}

/** Resgate de uso único (ex.: Eventim): só aqui o link é revelado, e o banco registra o horário. */
export async function resgatarIngresso(token: string): Promise<Resultado<string>> {
  if (!tokenValido(token)) return { ok: false, erro: "Link inválido." };
  const { data, error } = await (await supabaseServico()).rpc("dig_resgatar", { p_token: token });
  if (error) return falha(error);
  revalidatePath(`/i/${token}`);
  return { ok: true, dados: data as string };
}

/** Convidado manda uma dúvida pela página do ingresso (evento, área e o ingresso dele vão junto). */
export async function perguntarConvidado(token: string, texto: string): Promise<Resultado> {
  if (!tokenValido(token)) return { ok: false, erro: "Link inválido." };
  const sb = await supabaseServico();
  const { data: ing } = await sb.from("ingressos").select("id, evento_id, area_id, pessoa_id").eq("token", token).maybeSingle();
  if (!ing?.pessoa_id) return { ok: false, erro: "Link inválido." };
  const { data: p } = await sb.from("pessoas").select("nome, email").eq("id", ing.pessoa_id as string).maybeSingle();
  const { novaDuvida } = await import("@/lib/duvidas");
  try {
    await novaDuvida({
      evento_id: ing.evento_id as string, area_id: (ing.area_id as string | null) ?? null, ingresso_id: ing.id as string,
      autor_tipo: "convidado", autor_user: null, autor_nome: (p?.nome as string | null) ?? "Convidado", autor_email: (p?.email as string | null) ?? null,
    }, texto);
  } catch (e) {
    return falha(e);
  }
  revalidatePath(`/i/${token}`);
  return { ok: true, mensagem: p?.email ? "Enviado. A resposta aparece aqui e chega no seu e-mail." : "Enviado. A resposta aparece aqui nesta página." };
}
