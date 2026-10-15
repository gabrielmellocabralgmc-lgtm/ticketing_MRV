"use client";
// Painel do jogo (Marketing): um setor por aba, lista com o status de cada ingresso,
// lista de espera e "+ Adicionar convidado" (os mesmos poderes do Admin).
import { useState, useTransition } from "react";
import clsx from "clsx";
import { BotaoCopiar } from "@/components/copiar";
import { Aviso, Entrada, Selo } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { dataHora } from "@/lib/formato";
import { normalizarTexto } from "@/lib/texto";
import { ROTULO_SETOR, type Setor, type StatusIngresso } from "@/lib/tipos";
import { facialOk, pendenteFacial } from "../marketing-actions";
import { PortaCamarote, type Walkin } from "./camarote";
import { AcoesConvidados, type PessoaDaLista } from "../adicionar-convidado";
import { cancelarConvite } from "../areas/[area]/actions";
import { BotaoWhatsApp } from "@/components/copiar";
import { linkTorcedor, linkWhatsApp, textoConvite } from "@/lib/mensagens";
import { atualizarDadosAdmin } from "../adicionar-actions";
import type { OpcaoSetor } from "../adicionar-opcoes";
import { NomeEditavel } from "../nome-editavel";

export interface LinhaPainel {
  id: string;
  setor: Setor;
  area_nome: string;
  status: StatusIngresso;
  nome: string | null;
  cpf: string | null;
  celular: string | null;
  email: string | null;
  manual_admin?: boolean;
  anfitriao_externo?: string | null;
  chegada_em?: string | null;
  convidado_de: string | null;
  convidado_de_nome: string | null;
  enviado_em: string | null;
  lista_espera_desde: string | null;
}

export interface SetorPainel {
  setor: Setor;
  capacidade: number;
  ocupados: number;
}

// Status em linguagem simples para quem só acompanha
const STATUS_SIMPLES: Partial<Record<StatusIngresso, { rotulo: string; tom: "cinza" | "azul" | "amarelo" | "verde" | "laranja" | "vermelho" }>> = {
  solicitado: { rotulo: "Preenchido", tom: "cinza" },
  validado_area: { rotulo: "Aguardando aprovação", tom: "azul" },
  aprovado: { rotulo: "Pendente facial", tom: "vermelho" },
  facial_pendente: { rotulo: "Pendente facial", tom: "vermelho" },
  facial_ok: { rotulo: "Pronto para envio", tom: "verde" },
  enviado: { rotulo: "Enviado", tom: "verde" },
  confirmado: { rotulo: "Recebido", tom: "verde" },
  presente: { rotulo: "Presente", tom: "verde" },
  lista_espera: { rotulo: "Lista de espera", tom: "amarelo" },
};
const ENVIADOS: StatusIngresso[] = ["enviado", "confirmado", "presente"];

export interface ConvitePendente {
  id: string; token: string; nome_previsto: string | null; qtd_lugares: number; expira_em: string; setor: Setor; area_id: string; area_nome: string; contato: string | null;
}

export function PainelJogo({ evento, linhas, setores, areas, areaPadrao, walkins, opcoes, anfitrioes, eventoInfo, convites, simples }: {
  evento: string; linhas: LinhaPainel[]; setores: SetorPainel[];
  areas: { id: string; nome: string }[]; areaPadrao: string; walkins: Walkin[];
  opcoes: OpcaoSetor[]; anfitrioes: PessoaDaLista[]; convites: ConvitePendente[];
  eventoInfo: { titulo: string; inicio: string; abertura_portoes: string | null };
  /** Marketing: adicionar convidado só com nome, CPF e área. */
  simples?: boolean;
}) {
  const [setor, setSetor] = useState<Setor>(setores.find((s) => s.setor === "arquibancada")?.setor ?? setores[0]?.setor ?? "arquibancada");
  const [busca, setBusca] = useState("");

  const doSetor = linhas.filter((l) => l.setor === setor && l.nome); // vagas de convite sem dados ficam fora da lista
  const ativos = doSetor.filter((l) => l.status !== "lista_espera");
  const espera = doSetor.filter((l) => l.status === "lista_espera").sort((a, b) => (a.lista_espera_desde ?? "").localeCompare(b.lista_espera_desde ?? ""));
  const filtrar = (ls: LinhaPainel[]) => {
    if (!busca) return ls;
    const b = normalizarTexto(busca);
    const d = busca.replace(/\D/g, "");
    return ls.filter((l) => normalizarTexto(l.nome).includes(b) || normalizarTexto(l.area_nome).includes(b) || (d.length >= 3 && (l.cpf ?? "").includes(d)));
  };
  const info = setores.find((s) => s.setor === setor);
  const enviados = ativos.filter((l) => ENVIADOS.includes(l.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {setores.map((s) => (
          <button key={s.setor} onClick={() => setSetor(s.setor)}
            aria-pressed={s.setor === setor}
            className={clsx("rounded-xl border px-[18px] py-3 text-left", s.setor === setor ? "border-mrv-700 bg-mrv-700 text-white" : "border-borda bg-white text-tinta hover:border-mrv-600")}>
            <div className="text-[15px] font-bold">{ROTULO_SETOR[s.setor].split(" ")[0]}</div>
            <div className={clsx("tabular text-[13px]", s.setor === setor ? "text-white/85" : "text-cinza")}>{s.ocupados} de {s.capacidade}</div>
          </button>
        ))}
      </div>

      {/* as mesmas ações do Admin: abatem da cota e entram aprovadas */}
      <AcoesConvidados key={setor} evento={evento} areas={areas} setores={opcoes} setorInicial={setor} areaInicial={areaPadrao}
        anfitrioes={anfitrioes} eventoInfo={eventoInfo} simples={simples} />

      {setor === "camarote" && <PortaCamarote evento={evento} walkins={walkins} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Grande rotulo="Ocupados" valor={`${info?.ocupados ?? 0} / ${info?.capacidade ?? 0}`} />
        <Grande rotulo="Enviados" valor={enviados} />
        <Grande rotulo="Ainda não enviados" valor={ativos.length - enviados} laranja={ativos.length - enviados > 0} />
        <Grande rotulo="Lista de espera" valor={espera.length} laranja={espera.length > 0} />
      </div>

      <div className="rounded-2xl border border-borda bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Lista · {ROTULO_SETOR[setor]}</h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {setor === "camarote" && (
              <a href={`/eventos/${evento}/camarote/imprimir`} target="_blank" rel="noopener"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-mrv-700 ring-1 ring-mrv-600/40 hover:bg-mrv-50">Imprimir lista</a>
            )}
            <BotaoCopiar texto={filtrar(ativos).filter((l) => l.cpf).map((l) => `${l.nome}\t${formatarCpf(l.cpf)}`).join("\n")} rotulo="Copiar nomes e CPFs" />
            <div className="w-full sm:w-72"><Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, CPF ou área…" aria-label="Buscar" /></div>
          </div>
        </div>
        <TabelaSimples linhas={filtrar(ativos)} vazio="Ninguém neste setor ainda." evento={evento} />
      </div>

      <LinksPendentes evento={evento} convites={convites.filter((c) => c.setor === setor)} eventoInfo={eventoInfo} />

      {espera.length > 0 && (
        <div className="rounded-2xl border border-[#ffd9b3] bg-white p-5">
          <h2 className="mb-1 font-bold text-[#6b3a08]">Lista de espera · {ROTULO_SETOR[setor]}</h2>
          <p className="mb-3 text-sm text-[#8a4b0f]">Em ordem de chegada. Sobe sozinho quando abre vaga na área.</p>
          <TabelaSimples linhas={filtrar(espera)} posicao vazio="" />
        </div>
      )}
    </div>
  );
}

/** Links gerados que ainda não foram preenchidos (os lugares já estão reservados). */
function LinksPendentes({ evento, convites, eventoInfo }: { evento: string; convites: ConvitePendente[]; eventoInfo: { titulo: string; inicio: string; abertura_portoes: string | null } }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  if (!convites.length) return null;
  return (
    <div className="rounded-2xl border border-borda bg-white p-5">
      <h2 className="mb-1 font-bold">Links aguardando preenchimento</h2>
      <p className="mb-3 text-sm text-cinza">Os lugares já contam na cota. Se não preencherem até a validade, voltam para o saldo.</p>
      <ul className="divide-y divide-[#edeeed] text-sm">
        {convites.map((c) => {
          const texto = textoConvite({ nome: c.nome_previsto, evento: eventoInfo, setor: c.setor, area: c.area_nome, token: c.token, qtd: c.qtd_lugares });
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <b>{c.nome_previsto ?? "Sem referência"}</b> <span className="text-cinza">· {c.qtd_lugares} lugar(es) · {c.area_nome} · válido até {dataHora(c.expira_em)}</span>
              </div>
              <BotaoCopiar texto={linkTorcedor(c.token)} rotulo="Link" />
              <BotaoCopiar texto={texto} rotulo="Mensagem" />
              <BotaoWhatsApp link={linkWhatsApp(c.contato, texto)} />
              <button disabled={pendente} className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                onClick={() => confirm("Cancelar este link? Os lugares voltam para o saldo.") && iniciar(async () => {
                  const r = await cancelarConvite(evento, c.area_id, c.id);
                  setMsg(r.ok ? { ok: true, texto: r.mensagem ?? "Cancelado." } : { ok: false, texto: r.erro });
                })}>Cancelar</button>
            </li>
          );
        })}
      </ul>
      {msg && <div className="mt-2"><Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso></div>}
    </div>
  );
}

function Grande({ rotulo, valor, laranja }: { rotulo: string; valor: number | string; laranja?: boolean }) {
  return (
    <div className={clsx("rounded-2xl border p-5", laranja ? "border-[#ffd9b3] bg-laranja-100" : "border-borda bg-white")}>
      <div className={clsx("text-[13px] font-semibold", laranja ? "text-[#8a4b0f]" : "text-cinza")}>{rotulo}</div>
      <div className={clsx("tabular mt-1 font-display text-[40px] leading-tight font-bold", laranja ? "text-laranja-700" : "text-mrv-700")}>{valor}</div>
    </div>
  );
}

function TabelaSimples({ linhas, vazio, posicao, evento }: { linhas: LinhaPainel[]; vazio: string; posicao?: boolean; evento?: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>, confirmar: string) =>
    confirm(confirmar) && iniciar(async () => { const r = await f(); setMsg({ ok: r.ok, texto: (r.ok ? r.mensagem : r.erro) ?? "" }); });
  if (!linhas.length) return vazio ? <p className="py-6 text-center text-sm text-tinta/50">{vazio}</p> : null;
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs tracking-wide text-tinta/60 uppercase">
            <th className="px-4 py-2">{posicao ? "Posição" : "#"}</th><th className="px-4 py-2">Nome</th><th className="px-4 py-2">CPF</th>
            <th className="px-4 py-2">Área</th><th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => {
            const st = STATUS_SIMPLES[l.status] ?? { rotulo: l.status, tom: "cinza" as const };
            return (
              <tr key={l.id} className="border-t border-black/5">
                <td className="tabular px-4 py-2 text-xs text-tinta/40">{i + 1}</td>
                <td className={clsx("px-4 py-2", l.convidado_de ? "pl-8" : "font-medium")}>
                  {evento ? (
                    <NomeEditavel linha={l} salvar={(id, d) => atualizarDadosAdmin(evento, id, d)}>
                      <span>{l.convidado_de && <span className="text-tinta/40">↳ </span>}{l.nome}</span>
                    </NomeEditavel>
                  ) : <>{l.convidado_de && <span className="text-tinta/40">↳ </span>}{l.nome}</>}
                  {!l.convidado_de && l.anfitriao_externo && <span className="block text-xs font-normal text-tinta/50">convidado de {l.anfitriao_externo} (fora da lista)</span>}
                  {l.convidado_de && <span className="block text-xs font-normal text-tinta/50">convidado de {l.convidado_de_nome}</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{l.cpf ? formatarCpf(l.cpf) : "—"}</td>
                <td className="px-4 py-2 text-xs">{l.area_nome}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <Selo tom={st.tom}>{st.rotulo}</Selo>
                  {l.chegada_em && <span className="ml-1"><Selo tom="verde">Chegou {dataHora(l.chegada_em).split(" ")[1]}</Selo></span>}
                  {l.enviado_em && <span className="ml-1 text-xs text-tinta/50">{dataHora(l.enviado_em)}</span>}
                  {evento && l.status === "facial_ok" && (
                    <button disabled={ocupado} onClick={() => rodar(() => pendenteFacial(evento, [l.id]), `${l.nome} está sem facial no sistema do Atlético?`)}
                      className="ml-2 rounded-md px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50">Pendente facial</button>
                  )}
                  {evento && (l.status === "facial_pendente" || l.status === "aprovado") && (
                    <button disabled={ocupado} onClick={() => rodar(() => facialOk(evento, [l.id]), `Confirmar que ${l.nome} já tem a facial cadastrada?`)}
                      className="ml-2 rounded-md px-2 py-0.5 text-xs font-semibold text-mrv-700 ring-1 ring-mrv-600 hover:bg-mrv-50">Facial OK</button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {msg && <div className="px-4 pt-3"><Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso></div>}
    </div>
  );
}
