"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

const TIPOS = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function salvarImagem(chave: string, mime: string, base64: string): Promise<Resultado> {
  await exigirStaff();
  if (!TIPOS.includes(mime)) return { ok: false, erro: "Use PNG, JPG, WEBP ou SVG." };
  if (base64.length > 5.5 * 1024 * 1024) return { ok: false, erro: "Imagem grande demais (máx. 4 MB)." };
  // SVG pode carregar script: só aceitamos se não tiver <script> nem handlers
  if (mime === "image/svg+xml") {
    const svg = Buffer.from(base64, "base64").toString("utf8");
    if (/<script|on\w+\s*=|javascript:|<foreignObject/i.test(svg)) return { ok: false, erro: "SVG com conteúdo não permitido. Use PNG." };
  }
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("salvar_imagem", { p_chave: chave, p_mime: mime, p_base64: base64 });
  if (error) return falha(error);
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Imagem atualizada." };
}

export async function removerImagem(chave: string): Promise<Resultado> {
  await exigirStaff();
  const supabase = await supabaseServidor();
  const { error } = await supabase.rpc("remover_imagem", { p_chave: chave });
  if (error) return falha(error);
  revalidatePath("/", "layout");
  return { ok: true, mensagem: "Imagem removida." };
}
