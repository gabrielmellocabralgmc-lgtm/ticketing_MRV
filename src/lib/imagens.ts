import "server-only";
import { cache } from "react";
import { supabaseServico } from "@/lib/supabase/server";

export const CHAVE_LOGIN = "login";
export const CHAVE_LOGO = "logo-mrv"; // para fundo claro
export const CHAVE_LOGO_ESCURO = "logo-mrv-escuro"; // para fundo escuro (opcional)
export const CHAVE_ICONE = "icone"; // ícone da aba do navegador (opcional)
export const CHAVE_ESCUDO_ATLETICO = "escudo-atletico";
export const chaveEscudoAdversario = (evento: string) => `escudo-${evento}`;

/** chave → URL (com versão) das imagens já enviadas; ausente = mostrar o espaço vazio. */
export const imagensDisponiveis = cache(async (): Promise<Record<string, string>> => {
  const { data } = await (await supabaseServico()).rpc("imagens_disponiveis");
  return Object.fromEntries(
    ((data ?? []) as { chave: string; atualizado_em: string }[]).map((i) => [i.chave, `/img/${i.chave}?v=${new Date(i.atualizado_em).getTime()}`]),
  );
});
