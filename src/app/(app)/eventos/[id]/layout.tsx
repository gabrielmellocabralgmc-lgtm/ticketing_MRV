import { ProvedorSetores } from "@/components/setores";
import { supabaseServidor } from "@/lib/supabase/server";
import type { NomesSetores } from "@/lib/tipos";

// Deixa os nomes dos setores deste evento disponíveis para todas as telas do evento.
export default async function LayoutEvento({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = /^[0-9a-f-]{36}$/.test(id)
    ? await (await supabaseServidor()).from("eventos").select("nomes_setores").eq("id", id).maybeSingle()
    : { data: null };
  return <ProvedorSetores nomes={(data?.nomes_setores as NomesSetores) ?? null}>{children}</ProvedorSetores>;
}
