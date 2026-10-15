import { Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { EditorOperacao } from "./editor";
import type { BebidaForm, ItemForm } from "./actions";

export const metadata = { title: "Operação do camarote" };

export default async function AdminOperacao() {
  await exigirAdmin();
  const sb = await supabaseServidor();
  const [{ data: itens }, { data: bebidas }] = await Promise.all([
    sb.from("op_itens").select("id, momento, secao, texto, dica, ordem, ativo").order("momento").order("ordem"),
    sb.from("op_bebidas").select("id, nome, unidade, ordem, ativo").order("ordem"),
  ]);
  return (
    <>
      <Titulo voltar={{ href: "/admin", rotulo: "Configurações" }}
        sub="O que a operação do camarote confere antes e depois de cada jogo, e quais bebidas são contadas. Itens desativados somem dos próximos check-lists (o histórico fica).">
        Operação do camarote
      </Titulo>
      <EditorOperacao itens={(itens ?? []).map((i) => ({ ...i, dica: i.dica ?? "" })) as ItemForm[]} bebidas={(bebidas ?? []) as BebidaForm[]} />
    </>
  );
}
