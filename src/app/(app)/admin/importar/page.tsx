import { Cartao, Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ImportarForms, ImportarPlanilha } from "./importadores";

export const metadata = { title: "Importar" };

export default async function Importar() {
  await exigirAdmin();
  const supabase = await supabaseServidor();
  const [{ data: eventos }, { data: areas }] = await Promise.all([
    supabase.from("eventos").select("id, titulo").in("status", ["rascunho", "aberto", "fechado"]).order("inicio"),
    supabase.from("areas").select("id, nome").eq("ativo", true).order("ordem"),
  ]);
  return (
    <>
      <Titulo sub="Os dados passam pelas mesmas regras da tela (CPF válido, sem duplicidade no evento). A planilha não fica guardada no servidor.">Importar</Titulo>
      <div className="grid gap-6 xl:grid-cols-2">
        <Cartao>
          <h2 className="mb-1 font-bold text-mrv-900">Planilha de controle (histórico)</h2>
          <p className="mb-4 text-sm text-tinta/60">Abas Arquibancada, Camarote, Convidados Camarote e Divisão. Cria um evento novo com os ingressos e status.</p>
          <ImportarPlanilha />
        </Cartao>
        <Cartao>
          <h2 className="mb-1 font-bold text-mrv-900">Respostas do Microsoft Forms</h2>
          <p className="mb-4 text-sm text-tinta/60">Para a transição: adiciona as respostas como solicitações de um evento existente (excedente vai para a lista de espera).</p>
          <ImportarForms eventos={eventos ?? []} areas={areas ?? []} />
        </Cartao>
      </div>
    </>
  );
}
