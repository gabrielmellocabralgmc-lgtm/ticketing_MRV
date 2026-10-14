import { BotaoAcao, FormAcao } from "@/components/form-acao";
import { Campo, Cartao, Entrada, Selecao, Selo, Tabela, Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROTULO_PAPEL, type Papel } from "@/lib/tipos";
import { alternarAtivo, salvarUsuario } from "./actions";

export const metadata = { title: "Usuários" };

export default async function Usuarios() {
  await exigirAdmin();
  const supabase = await supabaseServidor();
  const [{ data: perfis }, { data: areas }, { data: resp }] = await Promise.all([
    supabase.from("perfis").select("user_id, nome, email, papel, ativo").order("papel").order("nome"),
    supabase.from("areas").select("id, nome").eq("ativo", true).order("ordem"),
    supabase.from("area_responsaveis").select("user_id, areas(nome)"),
  ]);
  const areasDe = (uid: string) => (resp ?? []).filter((r) => r.user_id === uid).map((r) => (r.areas as unknown as { nome: string }).nome);

  return (
    <>
      <Titulo sub="Quem acessa o sistema. Responsáveis veem só as listas das próprias áreas.">Usuários</Titulo>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Cartao>
          <Tabela>
            <thead><tr><th>Nome</th><th>Perfil</th><th>Áreas</th><th /></tr></thead>
            <tbody>
              {(perfis ?? []).map((p) => (
                <tr key={p.user_id} className={p.ativo ? "" : "opacity-50"}>
                  <td><div className="font-medium">{p.nome}</div><div className="text-xs text-tinta/60">{p.email}</div></td>
                  <td><Selo tom={p.papel === "admin" ? "laranja" : p.papel === "marketing" ? "verde" : "cinza"}>{ROTULO_PAPEL[p.papel as Papel]}</Selo></td>
                  <td className="text-xs">{areasDe(p.user_id).join(", ") || "—"}</td>
                  <td className="text-right">
                    <BotaoAcao acao={alternarAtivo.bind(null, p.user_id, !p.ativo)} rotulo={p.ativo ? "Desativar" : "Reativar"} variante={p.ativo ? "perigo" : "secundario"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Cartao>
        <Cartao className="h-fit">
          <h2 className="mb-3 font-bold text-mrv-900">Adicionar ou atualizar</h2>
          <FormAcao acao={salvarUsuario} rotulo="Salvar usuário">
            <Campo rotulo="Nome"><Entrada name="nome" required /></Campo>
            <Campo rotulo="E-mail"><Entrada name="email" type="email" required /></Campo>
            <Campo rotulo="Perfil">
              <Selecao name="papel" defaultValue="responsavel">
                {(Object.keys(ROTULO_PAPEL) as Papel[]).map((k) => <option key={k} value={k}>{ROTULO_PAPEL[k]}</option>)}
              </Selecao>
            </Campo>
            <fieldset className="text-sm">
              <legend className="mb-1 font-medium">Áreas (responsáveis)</legend>
              <div className="grid grid-cols-1 gap-1">
                {(areas ?? []).map((a) => (
                  <label key={a.id} className="flex items-center gap-2"><input type="checkbox" name="areas" value={a.id} className="accent-mrv-700" />{a.nome}</label>
                ))}
              </div>
            </fieldset>
          </FormAcao>
        </Cartao>
      </div>
    </>
  );
}
