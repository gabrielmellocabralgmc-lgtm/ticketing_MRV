import Link from "next/link";
import clsx from "clsx";
import { AoVivo } from "@/components/ao-vivo";
import { Escudo } from "@/components/jogo";
import { Cartao, Selo, Titulo, Vazio } from "@/components/ui";
import { dataHora, dataLonga } from "@/lib/formato";
import { CHAVE_ESCUDO_ATLETICO, chaveEscudoAdversario, imagensDisponiveis } from "@/lib/imagens";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROTULO_SETOR, type Setor } from "@/lib/tipos";

export const metadata = { title: "Dashboard" };

interface SetorDash { setor: Setor; capacidade: number; solicitados: number; aprovados: number; enviados: number; confirmados: number; presentes: number; espera: number }
interface EventoDash {
  id: string; titulo: string; inicio: string; status: string; concorrido: boolean; prazo_solicitacao: string | null; adversario: string | null;
  setores: SetorDash[];
  pendencias: {
    areas_sem_pedido: string[]; listas_sem_validar: string[]; convites_aguardando: number; convites_expiram_24h: number;
    a_aprovar: number; facial_pendente: number; a_enviar: number; fila_camarote: number; na_porta: number;
  };
}
interface AreaHist { area_id: string; area: string; eventos: number; cota: number; usados: number; cancelados: number; recusados: number; presentes: number; no_show: number; nao_aceitos: number; ultima_hora: number }
interface PessoaHist { pessoa_id: string; nome: string; cpf: string | null; areas: string; eventos: number; presentes: number; no_show: number; cancelados: number; nao_aceitos: number }
interface EventoHist { evento_id: string; titulo: string; inicio: string; concorrido: boolean; capacidade: number; usados: number; espera_nao_atendida: number; ultima_hora: number; presentes: number; no_show: number }

const PERIODOS = { "3": "3 meses", "6": "6 meses", "12": "12 meses" } as const;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

/** Barra de uma série só (magnitude), com o valor escrito ao lado: a cor nunca carrega sozinha a informação. */
function Barra({ valor, max, rotulo, tom = "verde" }: { valor: number; max: number; rotulo: string; tom?: "verde" | "laranja" }) {
  const largura = max > 0 ? Math.min(100, (valor / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2" title={`${rotulo}: ${valor} de ${max}`}>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#edeeed]">
        <div className={clsx("h-full rounded-full", tom === "verde" ? "bg-mrv-600" : "bg-laranja-500")} style={{ width: `${largura}%` }} />
      </div>
    </div>
  );
}

const ETAPAS: { chave: keyof SetorDash; rotulo: string }[] = [
  { chave: "solicitados", rotulo: "Solicitados" },
  { chave: "aprovados", rotulo: "Aprovados" },
  { chave: "enviados", rotulo: "Enviados" },
  { chave: "confirmados", rotulo: "Confirmados" },
  { chave: "presentes", rotulo: "Presentes" },
];

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await exigirStaff();
  const { periodo: p } = await searchParams;
  const periodo = (p && p in PERIODOS ? p : "6") as keyof typeof PERIODOS;
  const desde = new Date(Date.now() - Number(periodo) * 30.4 * 24 * 3600e3).toISOString();
  const supabase = await supabaseServidor();
  const [{ data: dash }, { data: areas }, { data: pessoas }, { data: jogos }, img] = await Promise.all([
    supabase.rpc("dashboard_eventos"),
    supabase.rpc("historico_areas", { p_desde: desde }),
    supabase.rpc("historico_pessoas", { p_desde: desde, p_limite: 20 }),
    supabase.rpc("historico_eventos", { p_desde: desde }),
    imagensDisponiveis(),
  ]);
  const eventos = ((dash ?? []) as { evento: EventoDash }[]).map((d) => d.evento);
  const hAreas = (areas ?? []) as AreaHist[];
  const hPessoas = (pessoas ?? []) as PessoaHist[];
  const hJogos = (jogos ?? []) as EventoHist[];
  await supabase.rpc("registrar_auditoria", { p_acao: "ver", p_entidade: "dashboard", p_entidade_id: null, p_detalhes: { periodo } });

  return (
    <>
      <AoVivo />
      <Titulo sub="Atualiza sozinho quando algo muda nos ingressos.">Dashboard</Titulo>

      <h2 className="mb-3 font-display text-[13px] font-bold tracking-[0.08em] text-cinza">PRÓXIMOS JOGOS</h2>
      {eventos.length === 0 && <Vazio>Nenhum jogo programado.</Vazio>}
      <div className="space-y-5">
        {eventos.map((e) => {
          const pd = e.pendencias;
          const pendencias = [
            pd.areas_sem_pedido.length > 0 && { texto: `${pd.areas_sem_pedido.length} área(s) sem nenhum pedido: ${pd.areas_sem_pedido.join(", ")}`, href: `/eventos/${e.id}`, acao: "Convocar / lembrar" },
            pd.listas_sem_validar.length > 0 && { texto: `Listas sem validar: ${pd.listas_sem_validar.join(", ")}`, href: `/eventos/${e.id}/aprovacao`, acao: "Ver" },
            pd.convites_aguardando > 0 && { texto: `${pd.convites_aguardando} convite(s) aguardando o convidado${pd.convites_expiram_24h ? ` · ${pd.convites_expiram_24h} expiram em 24 h` : ""}`, href: `/eventos/${e.id}`, acao: "Ver" },
            pd.a_aprovar > 0 && { texto: `${pd.a_aprovar} ingresso(s) validados aguardando aprovação`, href: `/eventos/${e.id}/aprovacao`, acao: "Aprovar" },
            pd.facial_pendente > 0 && { texto: `${pd.facial_pendente} pessoa(s) com a facial do Galo ID pendente`, href: `/eventos/${e.id}/aprovacao`, acao: "Lembrar" },
            pd.a_enviar > 0 && { texto: `${pd.a_enviar} ingresso(s) prontos para enviar no sistema do Atlético`, href: `/eventos/${e.id}/envio`, acao: "Enviar" },
            pd.fila_camarote > 0 && { texto: `${pd.fila_camarote} pessoa(s) na fila do camarote`, href: `/eventos/${e.id}/painel`, acao: "Distribuir" },
            pd.na_porta > 0 && { texto: `${pd.na_porta} pessoa(s) na porta do camarote, fora da lista`, href: `/eventos/${e.id}/painel`, acao: "Liberar" },
          ].filter(Boolean) as { texto: string; href: string; acao: string }[];
          return (
            <Cartao key={e.id} className="overflow-hidden p-0">
              <div className="flex items-center gap-4 bg-preto px-5 py-4 text-white">
                <Escudo url={img[CHAVE_ESCUDO_ATLETICO]} nome="do Atlético" tamanho="p" />
                <div className="min-w-0 flex-1">
                  <Link href={`/eventos/${e.id}`} className="font-display text-xl font-extrabold uppercase hover:underline">{e.titulo}</Link>
                  <div className="text-sm text-white/75 first-letter:uppercase">{dataLonga(e.inicio)}{e.prazo_solicitacao && ` · solicitações até ${dataHora(e.prazo_solicitacao)}`}</div>
                </div>
                
                <Escudo url={img[chaveEscudoAdversario(e.id)]} nome={e.adversario ? `do ${e.adversario}` : "do adversário"} tamanho="p" />
              </div>
              <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="grid gap-5 sm:grid-cols-2">
                  {e.setores.map((s) => (
                    <div key={s.setor}>
                      <div className="mb-2 flex items-baseline justify-between">
                        <h3 className="font-bold">{ROTULO_SETOR[s.setor].split(" ")[0]}</h3>
                        <span className="text-xs text-cinza">{s.capacidade} disponíveis{s.espera ? ` · ${s.espera} em espera` : ""}</span>
                      </div>
                      <dl className="space-y-1.5">
                        {ETAPAS.map((et) => (
                          <div key={et.chave} className="grid grid-cols-[96px_1fr_44px] items-center gap-2 text-sm">
                            <dt className="text-cinza">{et.rotulo}</dt>
                            <dd><Barra valor={s[et.chave] as number} max={s.capacidade} rotulo={et.rotulo} /></dd>
                            <dd className="tabular text-right font-semibold">{s[et.chave] as number}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
                <div>
                  <h3 className="mb-2 font-bold">Pendências</h3>
                  {pendencias.length === 0 ? <p className="text-sm text-mrv-700">Nada pendente. ✓</p> : (
                    <ul className="space-y-2">
                      {pendencias.map((x) => (
                        <li key={x.texto} className="flex items-start justify-between gap-3 rounded-lg bg-laranja-100 px-3 py-2 text-sm text-[#5c3307]">
                          <span>{x.texto}</span>
                          <Link href={x.href} className="shrink-0 font-semibold text-mrv-700 underline">{x.acao}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </Cartao>
          );
        })}
      </div>

      <div className="mt-12 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[13px] font-bold tracking-[0.08em] text-cinza">HISTÓRICO · JOGOS JÁ REALIZADOS</h2>
        <nav className="flex gap-1" aria-label="Período">
          {Object.entries(PERIODOS).map(([k, v]) => (
            <Link key={k} href={`?periodo=${k}`} aria-current={k === periodo ? "page" : undefined}
              className={clsx("rounded-full px-3 py-1 text-sm font-semibold", k === periodo ? "bg-mrv-700 text-white" : "bg-white text-mrv-700 ring-1 ring-borda")}>{v}</Link>
          ))}
        </nav>
      </div>

      <Cartao className="mb-5">
        <h3 className="mb-1 font-bold">Por área</h3>
        <p className="mb-3 text-xs text-cinza">
          Uso = ingressos usados ÷ cota. No-show vem do check-in do camarote (e do histórico importado). “Não aceitos”: ingressos enviados que a pessoa nunca confirmou pelo link (não vale para dados importados da planilha).
        </p>
        {hAreas.length === 0 ? <Vazio>Sem jogos no período.</Vazio> : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="bg-[#fafafa] text-left text-xs tracking-wide text-cinza uppercase">
                <th className="px-5 py-2">Área</th><th className="px-3 py-2 text-right">Jogos</th><th className="px-3 py-2 text-right">Cota</th>
                <th className="px-3 py-2 text-right">Usados</th><th className="w-48 px-3 py-2">Uso</th><th className="px-3 py-2 text-right">No-show</th>
                <th className="px-3 py-2 text-right">Não aceitos</th><th className="px-3 py-2 text-right">Cancelados</th><th className="px-5 py-2 text-right">Última hora</th>
              </tr></thead>
              <tbody>
                {hAreas.map((a) => {
                  const uso = pct(a.usados, a.cota);
                  const ns = pct(a.no_show, a.no_show + a.presentes);
                  return (
                    <tr key={a.area_id} className="border-t border-[#edeeed]">
                      <td className="px-5 py-2.5 font-medium">{a.area}</td>
                      <td className="tabular px-3 py-2.5 text-right">{a.eventos}</td>
                      <td className="tabular px-3 py-2.5 text-right">{a.cota || "—"}</td>
                      <td className="tabular px-3 py-2.5 text-right">{a.usados}</td>
                      <td className="px-3 py-2.5">
                        {uso === null ? <span className="text-xs text-cinza">sem cota</span> : (
                          <div className="flex items-center gap-2"><div className="flex-1"><Barra valor={a.usados} max={a.cota} rotulo="Uso da cota" /></div><span className="tabular w-10 text-right text-xs font-semibold">{uso}%</span></div>
                        )}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right">{ns === null ? "—" : <span className={ns >= 20 ? "font-semibold text-laranja-700" : ""}>{a.no_show} ({ns}%)</span>}</td>
                      <td className="tabular px-3 py-2.5 text-right">{a.nao_aceitos || "—"}</td>
                      <td className="tabular px-3 py-2.5 text-right">{a.cancelados || "—"}</td>
                      <td className="tabular px-5 py-2.5 text-right">{a.ultima_hora || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao>
          <h3 className="mb-1 font-bold">Pessoas com faltas</h3>
          <p className="mb-3 text-xs text-cinza">No-show no camarote, ingressos não aceitos e cancelamentos no período. CPF mascarado.</p>
          {hPessoas.length === 0 ? <Vazio>Ninguém com faltas no período.</Vazio> : (
            <ul className="divide-y divide-[#edeeed] text-sm">
              {hPessoas.map((x) => (
                <li key={x.pessoa_id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1"><b>{x.nome}</b> <span className="font-mono text-xs text-cinza">{x.cpf}</span><span className="block text-xs text-cinza">{x.areas} · {x.eventos} jogo(s)</span></span>
                  {x.no_show > 0 && <Selo tom="vermelho">{x.no_show} no-show</Selo>}
                  {x.nao_aceitos > 0 && <Selo tom="laranja">{x.nao_aceitos} não aceito(s)</Selo>}
                  {x.cancelados > 0 && <Selo>{x.cancelados} cancelado(s)</Selo>}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
        <Cartao>
          <h3 className="mb-1 font-bold">Jogos do período</h3>
          <p className="mb-3 text-xs text-cinza">Ocupação, procura que ficou de fora (lista de espera) e pedidos de última hora (após o prazo ou nas 24 h antes do jogo).</p>
          {hJogos.length === 0 ? <Vazio>Sem jogos no período.</Vazio> : (
            <ul className="divide-y divide-[#edeeed] text-sm">
              {hJogos.map((j) => (
                <li key={j.evento_id} className="py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link href={`/eventos/${j.evento_id}/relatorio`} className="font-semibold hover:underline">{j.titulo}</Link>
                    <span className="text-xs text-cinza">{dataHora(j.inicio).split(" ")[0]}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2"><div className="flex-1"><Barra valor={j.usados} max={j.capacidade} rotulo="Ocupação" /></div><span className="tabular w-24 text-right text-xs">{j.usados}/{j.capacidade} ({pct(j.usados, j.capacidade) ?? 0}%)</span></div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    
                    {j.espera_nao_atendida > 0 && <Selo tom="amarelo">{j.espera_nao_atendida} ficaram na espera</Selo>}
                    {j.ultima_hora > 0 && <Selo>{j.ultima_hora} de última hora</Selo>}
                    {j.no_show > 0 && <Selo tom="vermelho">{j.no_show} no-show</Selo>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
