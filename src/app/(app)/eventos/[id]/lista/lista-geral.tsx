"use client";
// Lista geral do evento, no espírito da planilha: tudo numa tabela, filtros, CPF a um clique.
import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { Aviso, Entrada, Selecao, SeloStatus } from "@/components/ui";
import { formatarCpf, somenteDigitos } from "@/lib/cpf";
import { celular, dataHora } from "@/lib/formato";
import type { Resultado } from "@/lib/erros";
import { normalizarTexto } from "@/lib/texto";
import { ROTULO_SETOR, type Setor, type StatusIngresso } from "@/lib/tipos";
import type { LinhaIngresso } from "../tabela-selecao";

export type LinhaGeral = LinhaIngresso & { pedido_id: string };

type Filtro = "ativos" | "a_enviar" | "sem_facial" | "enviados" | "na_area" | "espera" | "inativos" | "todos";
const FILTROS: { id: Filtro; rotulo: string; status: StatusIngresso[] | null }[] = [
  { id: "ativos", rotulo: "Todos ativos", status: ["solicitado", "validado_area", "aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado", "presente"] },
  { id: "a_enviar", rotulo: "A enviar", status: ["facial_ok"] },
  { id: "sem_facial", rotulo: "Aprovados sem facial", status: ["aprovado", "facial_pendente"] },
  { id: "enviados", rotulo: "Enviados", status: ["enviado", "confirmado", "presente"] },
  { id: "na_area", rotulo: "Aguardando área/aprovação", status: ["solicitado", "validado_area"] },
  { id: "espera", rotulo: "Lista de espera", status: ["lista_espera"] },
  { id: "inativos", rotulo: "Cancelados/recusados", status: ["cancelado", "recusado", "no_show"] },
  { id: "todos", rotulo: "Tudo", status: null },
];

type Ordem = "area" | "nome" | "status" | "enviado";

export function ListaGeral({ linhas, acoes }: {
  linhas: LinhaGeral[];
  acoes: {
    enviados: (ids: string[]) => Promise<Resultado>;
    enviadosSemFacial: (ids: string[]) => Promise<Resultado>;
    desfazerEnvio: (ids: string[]) => Promise<Resultado>;
    registrarCopia: (tipo: "cpfs" | "nome_cpf", qtd: number) => Promise<void>;
  };
}) {
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [setor, setSetor] = useState<"" | Setor>("");
  const [area, setArea] = useState("");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("area");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const areas = useMemo(() => [...new Map(linhas.map((l) => [l.area_id, l.area_nome])).entries()], [linhas]);
  const setores = useMemo(() => [...new Set(linhas.map((l) => l.setor))], [linhas]);

  const base = linhas.filter((l) => {
    if (setor && l.setor !== setor) return false;
    if (area && l.area_id !== area) return false;
    if (busca) {
      const b = normalizarTexto(busca);
      const d = somenteDigitos(busca);
      if (!normalizarTexto(l.nome).includes(b) && !(d.length >= 3 && (l.cpf ?? "").includes(d)) && !normalizarTexto(l.convidado_de_nome).includes(b)) return false;
    }
    return true;
  });
  const conta = (f: (typeof FILTROS)[number]) => base.filter((l) => !f.status || f.status.includes(l.status)).length;
  const atual = FILTROS.find((f) => f.id === filtro)!;
  const visiveis = base.filter((l) => !atual.status || atual.status.includes(l.status));
  if (ordem !== "area") {
    visiveis.sort((a, b) =>
      ordem === "nome" ? (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR")
        : ordem === "status" ? a.status.localeCompare(b.status)
          : (b.enviado_em ?? "").localeCompare(a.enviado_em ?? ""));
  }

  const copiar = async (l: LinhaGeral) => {
    if (!l.cpf) return;
    await navigator.clipboard.writeText(l.cpf);
    setCopiado(l.id);
    setTimeout(() => setCopiado((c) => (c === l.id ? null : c)), 2000);
    acoes.registrarCopia("cpfs", 1);
  };

  const rodar = (l: LinhaGeral, f: (ids: string[]) => Promise<Resultado>, confirmar?: string) => {
    if (confirmar && !confirm(confirmar)) return;
    iniciar(async () => {
      const r = await f([l.id]);
      setRetorno(r.ok ? { ok: true, msg: `${l.nome}: ${r.mensagem}` } : { ok: false, msg: r.erro });
    });
  };

  const Cab = ({ id, children, className }: { id?: Ordem; children: React.ReactNode; className?: string }) => (
    <th className={clsx("sticky top-0 z-10 bg-mrv-50 px-3 py-2 text-left text-xs font-semibold tracking-wide text-mrv-900 uppercase", className)}>
      {id ? <button onClick={() => setOrdem(id)} className={clsx("uppercase hover:underline", ordem === id && "underline")}>{children}{ordem === id && " ↓"}</button> : children}
    </th>
  );

  const totalLugares = base.filter((l) => !["cancelado", "recusado", "convite_expirado", "lista_espera"].includes(l.status)).length;
  const totalEnviados = base.filter((l) => ["enviado", "confirmado", "presente", "no_show"].includes(l.status)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou CPF…" aria-label="Buscar" />
        </div>
        <div className="w-full sm:w-52">
          <Selecao value={setor} onChange={(e) => setSetor(e.target.value as Setor | "")} aria-label="Setor">
            <option value="">Todos os setores</option>
            {setores.map((s) => <option key={s} value={s}>{ROTULO_SETOR[s]}</option>)}
          </Selecao>
        </div>
        <div className="w-full sm:w-60">
          <Selecao value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
            <option value="">Todas as áreas</option>
            {areas.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </Selecao>
        </div>
        <div className="ml-auto text-sm text-tinta/70">
          Reservados <b className="tabular">{totalLugares}</b> · Enviados <b className="tabular text-mrv-700">{totalEnviados}</b> · A enviar <b className="tabular text-laranja-500">{totalLugares - totalEnviados}</b>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={clsx("rounded-full px-3 py-1 text-sm font-medium", f.id === filtro ? "bg-mrv-700 text-white" : "bg-white text-mrv-700 ring-1 ring-mrv-700/20 hover:bg-mrv-50")}>
            {f.rotulo} <span className="tabular opacity-70">{conta(f)}</span>
          </button>
        ))}
      </div>

      {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}

      <div className="max-h-[70vh] overflow-auto rounded-xl bg-white ring-1 ring-black/10">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr>
              <Cab className="w-10">#</Cab>
              <Cab id="area">Área</Cab>
              <Cab>Setor</Cab>
              <Cab id="nome">Nome</Cab>
              <Cab>CPF <span className="font-normal normal-case">(clique copia)</span></Cab>
              <Cab>Celular</Cab>
              <Cab>Convidado de / indicação</Cab>
              <Cab id="status">Status</Cab>
              <Cab id="enviado">Enviado em</Cab>
              <Cab className="text-right">Ação</Cab>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr><td colSpan={10} className="py-10 text-center text-tinta/50">Nenhum ingresso neste filtro.</td></tr>
            )}
            {visiveis.map((l, i) => {
              const enviado = ["enviado", "confirmado", "presente"].includes(l.status);
              return (
                <tr key={l.id} className={clsx("border-t border-black/5 even:bg-fundo/50 hover:bg-mrv-50/60", enviado && "text-tinta/70")}>
                  <td className="tabular px-3 py-1.5 text-xs text-tinta/40">{i + 1}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap">{l.area_nome}</td>
                  <td className="px-3 py-1.5 text-xs whitespace-nowrap">{ROTULO_SETOR[l.setor].split(" ")[0]}</td>
                  <td className={clsx("px-3 py-1.5 whitespace-nowrap", l.convidado_de ? "pl-7" : "font-medium")}>{l.convidado_de && <span className="text-tinta/40">↳ </span>}{l.nome}</td>
                  <td className="px-3 py-1.5">
                    {l.cpf ? (
                      <button onClick={() => copiar(l)} title="Copiar CPF (só números)"
                        className={clsx("rounded px-1.5 py-0.5 font-mono text-xs whitespace-nowrap", copiado === l.id ? "bg-mrv-700 text-white" : "hover:bg-mrv-100")}>
                        {copiado === l.id ? "copiado ✓" : formatarCpf(l.cpf)}
                      </button>
                    ) : <span className="text-xs text-tinta/40">sem CPF</span>}
                  </td>
                  <td className="px-3 py-1.5 text-xs whitespace-nowrap">{celular(l.celular)}</td>
                  <td className="px-3 py-1.5 text-xs">{l.convidado_de ? l.convidado_de_nome : l.indicacao_de ?? ""}</td>
                  <td className="px-3 py-1.5"><SeloStatus status={l.status} /></td>
                  <td className="tabular px-3 py-1.5 text-xs whitespace-nowrap">{l.enviado_em ? dataHora(l.enviado_em) : ""}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap">
                    {l.status === "facial_ok" && (
                      <button disabled={pendente} onClick={() => rodar(l, acoes.enviados)}
                        className="rounded-md bg-mrv-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-mrv-900 disabled:opacity-50">Enviado ✓</button>
                    )}
                    {(l.status === "aprovado" || l.status === "facial_pendente") && (
                      <button disabled={pendente} onClick={() => rodar(l, acoes.enviadosSemFacial, `${l.nome} ainda não confirmou a facial. Marcar como enviado mesmo assim?`)}
                        className="rounded-md px-2.5 py-1 text-xs font-semibold text-orange-800 ring-1 ring-orange-300 hover:bg-laranja-100 disabled:opacity-50">Enviado (sem facial)</button>
                    )}
                    {l.status === "enviado" && (
                      <button disabled={pendente} onClick={() => rodar(l, acoes.desfazerEnvio, `Desfazer o envio de ${l.nome}?`)}
                        className="rounded-md px-2 py-1 text-xs text-tinta/50 hover:bg-black/5 hover:text-tinta">desfazer</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-tinta/50">{visiveis.length} linha(s). O CPF é copiado só com números, pronto para colar no sistema do Atlético. Cada cópia fica registrada na auditoria.</p>
    </div>
  );
}
