import type { Metadata } from "next";
import { Cartao, Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { criarEvento } from "../actions";
import { FormEvento } from "../form-evento";
import type { AreaSimples, PadraoTipo } from "../cotas-novo";

export const metadata: Metadata = { title: "Novo evento" };

export default async function NovoEvento() {
  await exigirAdmin();
  const supabase = await supabaseServidor();
  const [{ data }, { data: cfg }, { data: areas }] = await Promise.all([
    supabase.from("eventos").select("id, titulo, inicio").order("inicio", { ascending: false }).limit(20),
    supabase.from("config").select("valor").eq("chave", "cotas_padrao").maybeSingle(),
    supabase.from("areas").select("slug, nome").eq("ativo", true).order("ordem"),
  ]);
  return (
    <>
      <Titulo voltar={{ href: "/eventos", rotulo: "Eventos" }} sub="As cotas seguem o padrão do regulamento. Dá para personalizar antes de criar e ajustar a qualquer momento na página do evento.">Novo evento</Titulo>
      <Cartao className="max-w-3xl">
        <FormEvento acao={criarEvento} anteriores={data ?? []} padrao={(cfg?.valor ?? {}) as Record<string, PadraoTipo>} areas={(areas ?? []) as AreaSimples[]} />
      </Cartao>
    </>
  );
}
