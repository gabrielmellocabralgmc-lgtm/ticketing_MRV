"use client";
// Lista geral do evento, no espírito da planilha: uma tabela por setor (arquibancada/pista e camarote),
// nome sempre primeiro, CPF a um clique e "Enviar ingresso" na própria linha.
import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { Aviso, Entrada, Selecao, Selo, SeloStatus } from "@/components/ui";
import { formatarCpf, somenteDigitos } from "@/lib/cpf";
import { celular, dataHora } from "@/lib/formato";
import { linkWhatsApp, textoGaloId } from "@/lib/mensagens";
import type { Resultado } from "@/lib/erros";
import { normalizarTexto } from "@/lib/texto";
import { ROTULO_SETOR, type Setor, type StatusIngresso } from "@/lib/tipos";
import type { LinhaIngresso } from "../tabela-selecao";
import { NomeEditavel, semNome } from "../nome-editavel";

export type LinhaGeral = LinhaIngresso & { pedido_id: string };

type Filtro = "ativos" | "a_enviar" | "pendente_facial" | "enviados" | "sem_nome" | "na_area" | "espera" | "inativos" | "todos";
const FILTROS: { id: Filtro; rotulo: string; status: StatusIngresso[] | null }[] = [
  { id: "ativos", rotulo: "Todos ativos", status: ["solicitado", "validado_area", "aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado", "presente"] },
  { id: "a_enviar", rotulo: "Prontos para envio", status: ["facial_ok"] },
  { id: "pendente_facial", rotulo: "Pendente facial", status: ["aprovado", "facial_pendente"] },
  { id: "enviados", rotulo: "Enviados", status: ["enviado", "confirmado", "presente"] },
  { id: "sem_nome", rotulo: "Nome a informar", status: null },
  { id: "na_area", rotulo: "Preenchidos (aguardando aprovação)", status: ["solicitado", "validado_area"] },
  { id: "espera", rotulo: "Lista de espera", status: ["lista_espera"] },
  { id: "inativos", rotulo: "Cancelados/recusados", status: ["cancelado", "recusado", "no_show"] },
  { id: "todos", rotulo: "Tudo", status: null },
];
const ENVIADO: StatusIngresso[] = ["enviado", "confirmado", "presente"];

type Ordem = "area" | "nome" | "status";

interface Acoes {
  evento: { titulo: string; inicio: string; abertura_portoes: string | null };
  pendenteFacial: (ids: string[]) => Promise<Resultado>;
  facialOk: (ids: string[]) => Promise<Resultado>;
  validar: (ids: string[]) => Promise<Resultado>;
  enviados: (ids: string[]) => Promise<Resultado>;
  enviadosSemFacial: (ids: string[]) => Promise<Resultado>;
  desfazerEnvio: (ids: string[]) => Promise<Resultado>;
  registrarCopia: (tipo: "cpfs" | "nome_cpf", qtd: number) => Promise<void>;
  atualizarDados: (id: string, p: { nome: string; celular: string; email: string }) => Promise<Resultado>;
}

const passaFiltro = (f: (typeof FILTROS)[number], l: LinhaGeral) =>
  f.id === "sem_nome" ? semNome(l.nome) && !["cancelado", "recusado"].includes(l.status) : !f.status || f.status.includes(l.status);

export function ListaGeral({ linhas, acoes }: { linhas: LinhaGeral[]; acoes: Acoes }) {
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [area, setArea] = useState("");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("area");
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const areas = useMemo(() => [...new Map(linhas.map((l) => [l.area_id, l.area_nome])).entries()], [linhas]);
  const nomesPorId = useMemo(() => new Map(linhas.map((l) => [l.id, l.nome])), [linhas]);

  const base = linhas.filter((l) => {
    if (area && l.area_id !== area) return false;
    if (busca) {
      const b = normalizarTexto(busca);
      const d = somenteDigitos(busca);
      if (!normalizarTexto(l.nome).includes(b) && !(d.length >= 3 && (l.cpf ?? "").includes(d))) return false;
    }
    return true;
  });
  const conta = (f: (typeof FILTROS)[number]) => base.filter((l) => passaFiltro(f, l)).length;
  const atual = FILTROS.find((f) => f.id === filtro)!;
  const visiveis = base.filter((l) => passaFiltro(atual, l));

  const rodar = (l: LinhaGeral, f: (ids: string[]) => Promise<Resultado>, confirmar?: string) => {
    if (confirmar && !confirm(confirmar)) return;
    iniciar(async () => {
      const r = await f([l.id]);
      setRetorno(r.ok ? { ok: true, msg: `${l.nome}: ${r.mensagem}` } : { ok: false, msg: r.erro });
    });
  };

  // arquibancada/pista primeiro, camarote depois
  const setores = (["arquibancada", "pista", "camarote"] as Setor[]).filter((s) => linhas.some((l) => l.setor === s));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-72">
          <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou CPF…" aria-label="Buscar" />
        </div>
        <div className="w-full sm:w-64">
          <Selecao value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
            <option value="">Todas as áreas</option>
            {areas.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </Selecao>
        </div>
        <div className="flex items-center gap-2 text-sm text-cinza sm:ml-auto">
          Ordenar por
          <Selecao value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="w-32" aria-label="Ordenar por">
            <option value="area">Área</option>
            <option value="nome">Nome</option>
            <option value="status">Status</option>
          </Selecao>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.filter((f) => f.id !== "sem_nome" || conta(f) > 0).map((f) => (
          <button key={f.id} onClick={() => setFiltro(f.id)} aria-pressed={f.id === filtro}
            className={clsx("rounded-full px-3 py-1 text-sm font-medium", f.id === filtro ? "bg-mrv-700 text-white" : "bg-white text-mrv-700 ring-1 ring-borda hover:bg-mrv-50")}>
            {f.rotulo} <span className="tabular opacity-70">{conta(f)}</span>
          </button>
        ))}
      </div>

      {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}

      {setores.map((s) => (
        <TabelaSetor key={s} setor={s} todas={base.filter((l) => l.setor === s)} linhas={visiveis.filter((l) => l.setor === s)}
          ordem={ordem} nomesPorId={nomesPorId} pendente={pendente} acoes={acoes} rodar={rodar} />
      ))}
      <p className="text-xs text-cinza">Passe o mouse no nome para ver de quem é convidado, a indicação e quando foi enviado. Clique no CPF para copiar só os números (fica registrado na auditoria).</p>
    </div>
  );
}

function TabelaSetor({ setor, todas, linhas, ordem, nomesPorId, pendente, acoes, rodar }: {
  setor: Setor; todas: LinhaGeral[]; linhas: LinhaGeral[]; ordem: Ordem; nomesPorId: Map<string, string | null>;
  pendente: boolean; acoes: Acoes; rodar: (l: LinhaGeral, f: (ids: string[]) => Promise<Resultado>, confirmar?: string) => void;
}) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const ordenadas = [...linhas];
  if (ordem === "nome") ordenadas.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
  if (ordem === "status") ordenadas.sort((a, b) => a.status.localeCompare(b.status));
  const reservados = todas.filter((l) => !["cancelado", "recusado", "convite_expirado", "lista_espera"].includes(l.status)).length;
  const enviados = todas.filter((l) => ENVIADO.includes(l.status)).length;
  const prontos = todas.filter((l) => l.status === "facial_ok").length;

  const copiar = async (l: LinhaGeral) => {
    if (!l.cpf) return;
    await navigator.clipboard.writeText(l.cpf);
    setCopiado(l.id);
    setTimeout(() => setCopiado((c) => (c === l.id ? null : c)), 2000);
    acoes.registrarCopia("cpfs", 1);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-borda bg-white">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borda px-4 py-3">
        <h2 className="text-lg font-bold">{ROTULO_SETOR[setor]}</h2>
        <span className="text-sm text-cinza">
          Reservados <b className="tabular text-tinta">{reservados}</b> · Enviados <b className="tabular text-mrv-700">{enviados}</b> · Prontos para envio <b className="tabular text-mrv-700">{prontos}</b>
        </span>
      </header>
      <div className="max-h-[65vh] overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold tracking-wide text-cinza uppercase">
              {["#", "Nome", "CPF (clique copia)", "Celular", "Área", "Status / ação"].map((h, i) => (
                <th key={h} className={clsx("sticky top-0 z-10 bg-[#fafafa] px-3 py-2", i === 5 && "text-right")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-cinza">Nenhum ingresso neste filtro.</td></tr>}
            {ordenadas.map((l, i) => {
              const anfitriao = l.convidado_de ? nomesPorId.get(l.convidado_de) ?? l.convidado_de_nome : null;
              const detalhes = [
                anfitriao ? `${setor === "camarote" ? "Convidado do anfitrião" : "Acompanhante de"} ${anfitriao}` : setor === "camarote" ? "Anfitrião" : "Titular",
                l.indicacao_de && `Indicação: ${l.indicacao_de}`,
                l.enviado_em && `Enviado em ${dataHora(l.enviado_em)}`,
                l.facial_em && `Facial confirmada em ${dataHora(l.facial_em)}`,
              ].filter(Boolean) as string[];
              return (
                <tr key={l.id} className="border-t border-[#edeeed] even:bg-fundo/50 hover:bg-mrv-50/60">
                  <td className="tabular px-3 py-1.5 text-xs text-tinta/40">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <NomeEditavel linha={l} salvar={acoes.atualizarDados}>
                      {/* detalhes ao passar o mouse (ou focar com o teclado) */}
                      <span className="group relative inline-block" tabIndex={0}>
                        <span className="cursor-default font-medium underline decoration-dotted decoration-tinta/30 underline-offset-4">{l.nome}</span>
                        <span role="tooltip" className="pointer-events-none invisible absolute top-full left-0 z-20 mt-1 w-max max-w-72 rounded-lg bg-preto px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">
                          {detalhes.map((d) => <span key={d} className="block">{d}</span>)}
                        </span>
                      </span>
                    </NomeEditavel>
                  </td>
                  <td className="px-3 py-1.5">
                    {l.cpf ? (
                      <button onClick={() => copiar(l)} title="Copiar CPF (só números)"
                        className={clsx("rounded px-1.5 py-0.5 font-mono text-xs whitespace-nowrap", copiado === l.id ? "bg-mrv-700 text-white" : "hover:bg-mrv-100")}>
                        {copiado === l.id ? "copiado ✓" : formatarCpf(l.cpf)}
                      </button>
                    ) : <span className="text-xs text-cinza">sem CPF</span>}
                  </td>
                  <td className="px-3 py-1.5 text-xs whitespace-nowrap">{celular(l.celular)}</td>
                  <td className="px-3 py-1.5 text-xs">{l.area_nome}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    {l.status === "facial_ok" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <button disabled={pendente} onClick={() => rodar(l, acoes.pendenteFacial, `${l.nome} está sem facial no sistema do Atlético? Vamos marcar como pendente e mandar o passo a passo.`)}
                          title="A facial não está cadastrada no sistema do Atlético"
                          className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:opacity-50">Pendente facial</button>
                        <button disabled={pendente} onClick={() => rodar(l, acoes.enviados)}
                          className="rounded-lg bg-mrv-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-mrv-700 disabled:opacity-50">Enviar ingresso</button>
                      </span>
                    ) : l.status === "facial_pendente" || l.status === "aprovado" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Selo tom="vermelho">Pendente facial</Selo>
                        {l.celular && (
                          <a href={linkWhatsApp(l.celular, textoGaloId({ nome: l.nome ?? "", evento: acoes.evento, setor: l.setor, token: l.token }))} target="_blank" rel="noopener noreferrer"
                            className="rounded-md bg-[#25D366]/15 px-2 py-1 text-xs font-semibold text-[#0d7a3a] hover:bg-[#25D366]/25">WhatsApp</a>
                        )}
                        <button disabled={pendente} onClick={() => rodar(l, acoes.facialOk, `Confirmar que ${l.nome} já tem a facial cadastrada?`)}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-mrv-700 ring-1 ring-mrv-600 hover:bg-mrv-50 disabled:opacity-50">Facial OK</button>
                      </span>
                    ) : l.status === "enviado" ? (
                      <span className="inline-flex items-center gap-2">
                        <Selo tom="verde">Enviado</Selo>
                        <button disabled={pendente} onClick={() => rodar(l, acoes.desfazerEnvio, `Desfazer o envio de ${l.nome}?`)}
                          className="text-xs text-cinza hover:text-tinta hover:underline">desfazer</button>
                      </span>
                    ) : l.status === "solicitado" ? (
                      <span className="inline-flex items-center gap-1.5">
                        <SeloStatus status={l.status} />
                        <button disabled={pendente} onClick={() => rodar(l, acoes.validar, `Validar ${l.nome} em nome da área ${l.area_nome}?`)}
                          className="rounded-lg bg-mrv-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-mrv-700 disabled:opacity-50">Validar</button>
                      </span>
                    ) : <SeloStatus status={l.status} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
