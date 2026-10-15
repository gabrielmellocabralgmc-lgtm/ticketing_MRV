import { Cartao, Tabela, Titulo, Vazio } from "@/components/ui";
import { dataHora } from "@/lib/formato";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

export const metadata = { title: "Auditoria" };

export default async function Auditoria() {
  await exigirAdmin();
  const supabase = await supabaseServidor();
  const [{ data: logs }, { data: perfis }] = await Promise.all([
    supabase.from("auditoria").select("*").order("id", { ascending: false }).limit(300),
    supabase.from("perfis").select("user_id, nome"),
  ]);
  const nome = new Map((perfis ?? []).map((p) => [p.user_id, p.nome]));
  return (
    <>
      <Titulo voltar={{ href: "/admin", rotulo: "Configurações" }} sub="Quem viu, copiou, exportou ou alterou dados pessoais (últimos 300 registros).">Auditoria</Titulo>
      <Cartao>
        {!logs?.length ? <Vazio>Sem registros.</Vazio> : (
          <Tabela>
            <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Entidade</th><th>Detalhes</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{dataHora(l.em)}</td>
                  <td>{l.autor ? nome.get(l.autor) ?? l.autor : "sistema"}</td>
                  <td className="font-medium">{l.acao}</td>
                  <td className="text-xs">{l.entidade}{l.entidade_id && l.entidade === "imagem" && <span className="text-cinza"> · {l.entidade_id}</span>}</td>
                  <td className="max-w-md truncate font-mono text-xs text-tinta/60" title={JSON.stringify(l.detalhes)}>{l.detalhes ? JSON.stringify(l.detalhes) : ""}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  );
}
