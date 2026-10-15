import type { Metadata } from "next";
import { Cartao, Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { criarEvento } from "../actions";
import { FormEvento } from "../form-evento";

export const metadata: Metadata = { title: "Novo evento" };

export default async function NovoEvento() {
  await exigirAdmin();
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("eventos").select("id, titulo, inicio").order("inicio", { ascending: false }).limit(20);
  return (
    <>
      <Titulo voltar={{ href: "/eventos", rotulo: "Eventos" }} sub="As cotas padrão seguem o regulamento: camarote 44 · arquibancada 100 (jogos) · pista 50 (shows). Dá para ajustar depois.">Novo evento</Titulo>
      <Cartao className="max-w-3xl">
        <FormEvento acao={criarEvento} anteriores={data ?? []} />
      </Cartao>
    </>
  );
}
