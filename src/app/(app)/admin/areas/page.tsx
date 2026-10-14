import { BotaoAcao, FormAcao } from "@/components/form-acao";
import { Campo, Cartao, Entrada, Selo, Titulo } from "@/components/ui";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { adicionarResponsavel, removerResponsavel, salvarArea } from "./actions";

export const metadata = { title: "Áreas e responsáveis" };

export default async function Areas() {
  await exigirStaff();
  const supabase = await supabaseServidor();
  const [{ data: areas }, { data: resp }] = await Promise.all([
    supabase.from("areas").select("id, nome, centro_custo, ativo, ordem").order("ativo", { ascending: false }).order("ordem"),
    supabase.rpc("responsaveis_por_area"),
  ]);
  const responsaveis = (resp ?? []) as { area_id: string; user_id: string; nome: string; email: string; ativo: boolean }[];

  return (
    <>
      <Titulo sub="Cada área pode ter mais de um responsável, e uma pessoa pode responder por várias áreas. Responsáveis recebem acesso por magic link e veem só as listas das suas áreas.">
        Áreas e responsáveis
      </Titulo>

      <Cartao className="mb-6">
        <h2 className="mb-3 font-bold text-mrv-900">Nova área</h2>
        <FormAcao acao={salvarArea.bind(null, null)} rotulo="Criar área" className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end sm:space-y-0">
          <Campo rotulo="Nome"><Entrada name="nome" required placeholder="ex.: Jurídico" /></Campo>
          <Campo rotulo="Centro de custo (opcional)"><Entrada name="centro_custo" /></Campo>
        </FormAcao>
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-2">
        {(areas ?? []).map((a) => {
          const daArea = responsaveis.filter((r) => r.area_id === a.id);
          return (
            <Cartao key={a.id} className={a.ativo ? "" : "opacity-60"}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-mrv-900">{a.nome}</h2>
                  <p className="text-xs text-tinta/60">{a.centro_custo ? `Centro de custo ${a.centro_custo}` : "Sem centro de custo"}</p>
                </div>
                {!a.ativo && <Selo>Inativa</Selo>}
              </div>

              <h3 className="mb-1 text-xs font-semibold tracking-wide text-tinta/60 uppercase">Responsáveis ({daArea.length})</h3>
              {daArea.length === 0 ? (
                <p className="mb-3 text-sm text-amber-700">Ninguém responde por esta área ainda.</p>
              ) : (
                <ul className="mb-3 divide-y divide-black/5">
                  {daArea.map((r) => (
                    <li key={r.user_id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                      <span>
                        <span className="font-medium">{r.nome}</span> <span className="text-tinta/60">{r.email}</span>
                        {!r.ativo && <> <Selo tom="vermelho">desativado</Selo></>}
                      </span>
                      <BotaoAcao acao={removerResponsavel.bind(null, a.id, r.user_id)} rotulo="Remover" variante="perigo"
                        confirmar={`Remover ${r.nome} dos responsáveis de ${a.nome}?`} />
                    </li>
                  ))}
                </ul>
              )}

              <FormAcao acao={adicionarResponsavel.bind(null, a.id)} rotulo="Adicionar responsável" variante="secundario"
                className="grid gap-2 sm:grid-cols-[1fr_1.3fr] [&>button]:sm:col-span-2 [&>button]:sm:justify-self-start">
                <Entrada name="nome" placeholder="Nome" required aria-label="Nome do responsável" />
                <Entrada name="email" type="email" placeholder="email@mrv.com.br" required aria-label="E-mail do responsável" />
              </FormAcao>

              <details className="mt-4 text-sm">
                <summary className="cursor-pointer font-semibold text-mrv-700">Editar área</summary>
                <FormAcao acao={salvarArea.bind(null, a.id)} rotulo="Salvar" limparAoConcluir={false} className="mt-3">
                  <Campo rotulo="Nome"><Entrada name="nome" defaultValue={a.nome} required /></Campo>
                  <Campo rotulo="Centro de custo"><Entrada name="centro_custo" defaultValue={a.centro_custo ?? ""} /></Campo>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="ativo" defaultChecked={a.ativo} className="accent-mrv-700" /> Área ativa (aparece em novos eventos e nos formulários)
                  </label>
                </FormAcao>
              </details>
            </Cartao>
          );
        })}
      </div>
    </>
  );
}
