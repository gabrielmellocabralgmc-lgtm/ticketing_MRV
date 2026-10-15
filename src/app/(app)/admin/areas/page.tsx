import { BotaoAcao, FormAcao } from "@/components/form-acao";
import { Campo, Cartao, Entrada, Selo, Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import Link from "next/link";
import clsx from "clsx";
import { ROTULO_SETOR, type Setor } from "@/lib/tipos";
import { adicionarResponsavel, removerResponsavel, salvarArea } from "./actions";
import { CotasPadrao, type Padrao } from "./cotas";

export const metadata = { title: "Áreas e responsáveis" };

export default async function Areas() {
  await exigirAdmin();
  const supabase = await supabaseServidor();
  const [{ data: areas }, { data: resp }, { data: cfg }, { data: proximos }] = await Promise.all([
    supabase.from("areas").select("id, nome, slug, centro_custo, ativo, ordem").order("ativo", { ascending: false }).order("ordem"),
    supabase.rpc("responsaveis_por_area"),
    supabase.from("config").select("valor").eq("chave", "cotas_padrao").single(),
    supabase.from("eventos").select("id, titulo, inicio").in("status", ["rascunho", "aberto", "fechado"]).gt("inicio", new Date().toISOString()).order("inicio").limit(4),
  ]);
  // uso das cotas nos próximos jogos, por área
  const usoPorArea = new Map<string, { evento: string; titulo: string; setor: Setor; cota: number; usados: number }[]>();
  for (const ev of proximos ?? []) {
    const { data: linhas } = await supabase.rpc("resumo_evento", { p_evento: ev.id });
    for (const l of (linhas ?? []) as { area_id: string; setor: Setor; cota: number | null; ocupados: number }[]) {
      if (l.cota === null) continue;
      usoPorArea.set(l.area_id, [...(usoPorArea.get(l.area_id) ?? []), { evento: ev.id, titulo: ev.titulo, setor: l.setor, cota: l.cota, usados: l.ocupados }]);
    }
  }
  const responsaveis = (resp ?? []) as { area_id: string; user_id: string; nome: string; email: string; ativo: boolean }[];

  return (
    <>
      <Titulo voltar={{ href: "/admin", rotulo: "Configurações" }} sub="Cada área pode ter mais de um responsável, e uma pessoa pode responder por várias áreas. Responsáveis recebem acesso por magic link e veem só as listas das suas áreas.">
        Áreas e responsáveis
      </Titulo>

      {cfg && <CotasPadrao padrao={cfg.valor as Padrao} areas={(areas ?? []).filter((a) => a.ativo).map((a) => ({ slug: a.slug, nome: a.nome }))} />}

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
          const ehMarketing = a.slug === "marketing";
          const uso = usoPorArea.get(a.id) ?? [];
          return (
            <Cartao key={a.id} className={a.ativo ? "" : "opacity-60"}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-mrv-900">{a.nome}</h2>
                  <p className="text-xs text-tinta/60">{a.centro_custo ? `Centro de custo ${a.centro_custo}` : "Sem centro de custo"}</p>
                </div>
                {!a.ativo && <Selo>Inativa</Selo>}
              </div>

              <h3 className="mb-1 text-xs font-semibold tracking-wide text-cinza uppercase">Cotas nos próximos jogos</h3>
              {uso.length === 0 ? <p className="mb-3 text-sm text-cinza">Sem cota nos próximos jogos.</p> : (
                <ul className="mb-4 space-y-1 text-sm">
                  {uso.map((u) => (
                    <li key={`${u.evento}-${u.setor}`} className="flex items-center justify-between gap-2">
                      <Link href={`/eventos/${u.evento}/areas/${a.id}?setor=${u.setor}`} className="hover:underline">{u.titulo} <span className="text-cinza">· {ROTULO_SETOR[u.setor].split(" ")[0]}</span></Link>
                      <span className={clsx("tabular font-semibold", u.usados >= u.cota && "text-laranja-700")}>{u.usados}/{u.cota}</span>
                    </li>
                  ))}
                </ul>
              )}

              {ehMarketing ? (
                <>
                  <p className="mb-3 rounded-lg bg-mrv-50 px-3 py-2 text-sm text-mrv-700">
                    Gerida pelo próprio perfil <b>Marketing</b>: não precisa de responsável, e os nomes lançados já entram aprovados.
                  </p>
                  {daArea.length > 0 && (
                    <ul className="mb-3 text-sm">
                      <li className="mb-1 text-xs text-cinza">Vinculado(s) como responsável — não é mais necessário. Se for a gestora, mude o perfil dela para “Marketing MRV” em Usuários e remova daqui:</li>
                      {daArea.map((r) => (
                        <li key={r.user_id} className="flex items-center justify-between gap-2 py-1">
                          <span>{r.nome} <span className="text-cinza">{r.email}</span></span>
                          <BotaoAcao acao={removerResponsavel.bind(null, a.id, r.user_id)} rotulo="Remover" variante="perigo" confirmar={`Remover ${r.nome} da área Marketing?`} />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : <>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-cinza uppercase">Responsáveis ({daArea.length})</h3>
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
              </>}

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
