"use client";
// Painel do evento (Marketing): um setor por aba, lista com o status de cada ingresso,
// lista de espera e "+ Adicionar convidado" (os mesmos poderes do Admin).
import { Fragment, useState, useTransition } from "react";
import clsx from "clsx";
import { BotaoCopiar } from "@/components/copiar";
import { Aviso, Botao, Entrada, Selo } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { dataHora } from "@/lib/formato";
import { normalizarTexto } from "@/lib/texto";
import { type Setor, type StatusIngresso } from "@/lib/tipos";
import { facialOk, pendenteFacial } from "../marketing-actions";
import { PortaCamarote, type Walkin } from "./camarote";
import { AcoesConvidados, DefinirAnfitriao, type PessoaDaLista } from "../adicionar-convidado";
import { cancelarConvite } from "../areas/[area]/actions";
import { BotaoWhatsApp } from "@/components/copiar";
import { linkTorcedor, linkWhatsApp, textoConvite } from "@/lib/mensagens";
import { atualizarDadosAdmin, definirConvidadoDe, preencherReserva } from "../adicionar-actions";
import type { OpcaoSetor } from "../adicionar-opcoes";
import { NomeEditavel } from "../nome-editavel";
import { EditorCotas, type AreaCota } from "../editor-cotas";
import { NomeSetor } from "@/components/setores";
import { convidadoDe } from "@/lib/anfitriao";
import { cancelarIngresso } from "../galo-actions";

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
  token?: string;
  chegada_em?: string | null;
  convidado_de: string | null;
  convidado_de_nome: string | null;
  enviado_em: string | null;
  lista_espera_desde: string | null;
  /** Reserva sem nome ainda: para quem os lugares estão guardados. */
  reservado_para?: string | null;
}

export interface SetorPainel {
  setor: Setor;
  capacidade: number;
  ocupados: number;
}

// Status em linguagem simples para quem só acompanha
const STATUS_SIMPLES: Partial<Record<StatusIngresso, { rotulo: string; tom: "cinza" | "azul" | "amarelo" | "verde" | "laranja" | "vermelho" }>> = {
  reservado: { rotulo: "Reservado", tom: "laranja" },
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

export function PainelJogo({ evento, linhas, setores, areas, areaPadrao, walkins, opcoes, anfitrioes, eventoInfo, convites, simples, leitura = false, digital = false, facial = true, digitais = {}, cotas = {} }: {
  evento: string; linhas: LinhaPainel[]; setores: SetorPainel[];
  areas: { id: string; nome: string }[]; areaPadrao: string; walkins: Walkin[];
  opcoes: OpcaoSetor[]; anfitrioes: PessoaDaLista[]; convites: ConvitePendente[];
  eventoInfo: { titulo: string; inicio: string; abertura_portoes: string | null };
  /** Marketing: adicionar convidado só com nome, CPF e área. */
  simples?: boolean;
  /** Só acompanhar (Marketing): sem botões de ação. */
  leitura?: boolean;
  /** Evento com ingresso digital (PDF/link enviado pelo sistema). */
  digital?: boolean;
  /** Evento exige facial: mostra os botões de facial. */
  facial?: boolean;
  /** Ingressos digitais distribuídos: id do ingresso → já enviado? */
  digitais?: Record<string, boolean>;
  /** Cotas de cada setor, para editar/remanejar daqui mesmo. */
  cotas?: Record<string, { capacidade: number; cotaPorArea: boolean; areas: AreaCota[] }>;
}) {
  const [setor, setSetor] = useState<Setor>(setores.find((s) => s.setor === "arquibancada")?.setor ?? setores[0]?.setor ?? "arquibancada");
  const [busca, setBusca] = useState("");

  // vagas de convite sem dados ficam fora da lista; reservas aparecem ("Reservado para …")
  const doSetor = linhas.filter((l) => l.setor === setor && (l.nome || l.status === "reservado"));
  const ativos = doSetor.filter((l) => l.status !== "lista_espera");
  const filtrar = (ls: LinhaPainel[]) => {
    if (!busca) return ls;
    const b = normalizarTexto(busca);
    const d = busca.replace(/\D/g, "");
    return ls.filter((l) => normalizarTexto(l.nome).includes(b) || normalizarTexto(l.reservado_para).includes(b) || normalizarTexto(l.area_nome).includes(b)
      || normalizarTexto(l.convidado_de_nome).includes(b) || (d.length >= 3 && (l.cpf ?? "").includes(d)));
  };
  const info = setores.find((s) => s.setor === setor);
  const enviados = ativos.filter((l) => ENVIADOS.includes(l.status)).length;
  const reservados = ativos.filter((l) => l.status === "reservado").length;
  // de quem são as reservas e quantas de cada (para o quadrinho do resumo)
  const porReserva = new Map<string, number>();
  for (const l of ativos) if (l.status === "reservado") {
    const quem = l.reservado_para?.trim() || "Sem nome";
    porReserva.set(quem, (porReserva.get(quem) ?? 0) + 1);
  }
  const detalheReservas = [...porReserva].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([quem, n]) => `${n} · ${quem}`);
  // sem facial: aprovado já está pronto para envio
  const semFacial = facial ? ativos.filter((l) => l.status === "aprovado" || l.status === "facial_pendente").length : 0;
  const prontos = ativos.filter((l) => l.status === "facial_ok" || (!facial && l.status === "aprovado")).length;
  const aguardando = ativos.length - enviados - reservados - semFacial - prontos; // preenchidos, a validar/aprovar etc.
  const capacidade = info?.capacidade ?? 0;
  const disponiveis = Math.max(0, capacidade - (info?.ocupados ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {setores.map((s) => (
          <button key={s.setor} onClick={() => setSetor(s.setor)}
            aria-pressed={s.setor === setor}
            className={clsx("rounded-xl border px-[18px] py-3 text-left", s.setor === setor ? "border-mrv-700 bg-mrv-700 text-white" : "border-borda bg-white text-tinta hover:border-mrv-600")}>
            <div className="text-[15px] font-bold"><NomeSetor s={s.setor} curto /></div>
            <div className={clsx("tabular text-[13px]", s.setor === setor ? "text-white/85" : "text-cinza")}>{s.ocupados} de {s.capacidade}</div>
          </button>
        ))}
      </div>

      {/* as mesmas ações do Admin: abatem da cota e entram aprovadas */}
      {!leitura && <AcoesConvidados key={setor} evento={evento} areas={areas} setores={opcoes} setorInicial={setor} areaInicial={areaPadrao}
        anfitrioes={anfitrioes} eventoInfo={eventoInfo} simples={simples} exigirEmail={digital} facial={facial} />}
      {digital && (
        <div className="flex justify-end">
          <a href={`/eventos/${evento}/ingressos-digitais`} className="rounded-lg bg-mrv-600 px-4 py-2 text-sm font-bold text-white hover:bg-mrv-700">Ingressos digitais (PDF/links) →</a>
        </div>
      )}

      {setor === "camarote" && !leitura && <PortaCamarote evento={evento} walkins={walkins} />}

      {cotas[setor] && !leitura && (
        <EditorCotas key={`cotas-${setor}`} evento={evento} setor={setor} capacidade={cotas[setor].capacidade}
          cotaPorArea={cotas[setor].cotaPorArea} areas={cotas[setor].areas} />
      )}

      {/* Disponíveis em destaque: é o número que o Marketing mais procura */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border-2 border-mrv-700 bg-mrv-50 px-6 py-4">
        <div>
          <div className="text-sm font-bold tracking-wide text-mrv-700 uppercase">Disponíveis · <NomeSetor s={setor} curto /></div>
          <div className="tabular font-display text-[56px] leading-none font-bold text-mrv-700">{disponiveis}</div>
        </div>
        <p className="text-sm text-tinta/70">
          lugar{disponiveis === 1 ? "" : "es"} livre{disponiveis === 1 ? "" : "s"} de <b>{capacidade}</b> no total
          <span className="block text-xs text-cinza">{info?.ocupados ?? 0} ocupado(s), contando reservas</span>
        </p>
      </div>
      <div className={clsx("grid grid-cols-2 gap-3", aguardando > 0 ? "sm:grid-cols-5" : "sm:grid-cols-4")}>
        <Grande rotulo="Enviados" valor={enviados} />
        <Grande rotulo="Prontos para envio" valor={prontos} />
        {facial && <Grande rotulo="Pendente envio · falta facial" valor={semFacial} laranja={semFacial > 0} />}
        <Grande rotulo="🔖 Reservados (sem nome)" valor={reservados} laranja={reservados > 0} detalhe={detalheReservas} />
        {aguardando > 0 && <Grande rotulo="Aguardando aprovação/dados" valor={aguardando} />}
      </div>

      <div className="rounded-2xl border border-borda bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Lista · <NomeSetor s={setor} />
            {reservados > 0 && <span className="ml-2 align-middle text-sm font-semibold text-laranja-700">🔖 {reservados} reservado{reservados > 1 ? "s" : ""}</span>}
          </h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {setor === "camarote" && (
              <a href={`/eventos/${evento}/camarote/imprimir`} target="_blank" rel="noopener"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-mrv-700 ring-1 ring-mrv-600/40 hover:bg-mrv-50">Imprimir lista</a>
            )}
            <BotaoCopiar texto={filtrar(ativos).filter((l) => l.cpf).map((l) => `${l.nome}\t${formatarCpf(l.cpf)}`).join("\n")} rotulo="Copiar nomes e CPFs" />
            <div className="w-full sm:w-72"><Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, CPF ou área…" aria-label="Buscar" /></div>
          </div>
        </div>
        <TabelaSimples linhas={filtrar(ativos)} vazio="Ninguém neste setor ainda." evento={leitura ? undefined : evento} facial={facial} digitais={digitais} anfitrioes={anfitrioes} />
      </div>

      {!leitura && <LinksPendentes evento={evento} convites={convites.filter((c) => c.setor === setor)} eventoInfo={eventoInfo} />}

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

function Grande({ rotulo, valor, laranja, detalhe = [] }: { rotulo: string; valor: number | string; laranja?: boolean; detalhe?: string[] }) {
  return (
    <div className={clsx("rounded-2xl border p-5", laranja ? "border-[#ffd9b3] bg-laranja-100" : "border-borda bg-white")}>
      <div className={clsx("text-[13px] font-semibold", laranja ? "text-[#8a4b0f]" : "text-cinza")}>{rotulo}</div>
      <div className={clsx("tabular mt-1 font-display text-[40px] leading-tight font-bold", laranja ? "text-laranja-700" : "text-mrv-700")}>{valor}</div>
      {detalhe.length > 0 && (
        <ul className="mt-1 max-h-16 overflow-y-auto text-[11px] leading-tight text-[#8a4b0f]" title={detalhe.join("\n")}>
          {detalhe.map((d) => <li key={d} className="truncate">{d}</li>)}
        </ul>
      )}
    </div>
  );
}

function TabelaSimples({ linhas, vazio, posicao, evento, facial = true, digitais = {}, anfitrioes = [] }: {
  linhas: LinhaPainel[]; vazio: string; posicao?: boolean; evento?: string; facial?: boolean; digitais?: Record<string, boolean>;
  /** Quem está ativo na lista do jogo (para escolher de quem alguém do camarote é convidado). */
  anfitrioes?: PessoaDaLista[];
}) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [preenchendo, setPreenchendo] = useState<string | null>(null);
  const [vinculando, setVinculando] = useState<string | null>(null);
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
            const reserva = l.status === "reservado";
            return (
              <Fragment key={l.id}>
              <tr className={clsx("border-t border-black/5", reserva && "bg-laranja-100/40")}>
                <td className="tabular px-4 py-2 text-xs text-tinta/40">{i + 1}</td>
                <td className={clsx("px-4 py-2", l.convidado_de ? "pl-8" : "font-medium")}>
                  {reserva ? (
                    <span>🔖 Reservado para <b>{l.reservado_para ?? "—"}</b></span>
                  ) : evento ? (
                    <NomeEditavel linha={l} salvar={(id, d) => atualizarDadosAdmin(evento, id, d)}>
                      <span>{l.convidado_de && <span className="text-tinta/40">↳ </span>}{l.nome}</span>
                    </NomeEditavel>
                  ) : <>{l.convidado_de && <span className="text-tinta/40">↳ </span>}{l.nome}</>}
                  {convidadoDe(l) && <span className="block text-xs font-normal text-tinta/50">convidado de {convidadoDe(l)}{!l.convidado_de && " (fora da lista)"}</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{l.cpf ? formatarCpf(l.cpf) : "—"}</td>
                <td className="px-4 py-2 text-xs">{l.area_nome}</td>
                <td className="px-4 py-2 whitespace-nowrap">
                  {l.token && l.id in digitais && (
                    <span className="mr-1.5 inline-block"><BotaoCopiar texto={`${linkTorcedor(l.token)}/ingresso`} rotulo="🎟 Link do ingresso" /></span>
                  )}
                  <Selo tom={st.tom}>{st.rotulo}</Selo>
                  {l.chegada_em && <span className="ml-1"><Selo tom="verde">Chegou {dataHora(l.chegada_em).split(" ")[1]}</Selo></span>}
                  {l.enviado_em && <span className="ml-1 text-xs text-tinta/50">{dataHora(l.enviado_em)}</span>}
                  {evento && facial && l.status === "facial_ok" && (
                    <button disabled={ocupado} onClick={() => rodar(() => pendenteFacial(evento, [l.id]), `${l.nome} está sem facial no sistema do Atlético?`)}
                      className="ml-2 rounded-md px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50">Pendente facial</button>
                  )}
                  {evento && (l.status === "facial_pendente" || l.status === "aprovado") && (
                    <button disabled={ocupado} onClick={() => rodar(() => facialOk(evento, [l.id]), `Confirmar que ${l.nome} já tem a facial cadastrada?`)}
                      className="ml-2 rounded-md px-2 py-0.5 text-xs font-semibold text-mrv-700 ring-1 ring-mrv-600 hover:bg-mrv-50">Facial OK</button>
                  )}
                  {evento && l.setor === "camarote" && !reserva && (
                    <button disabled={ocupado} onClick={() => setVinculando((x) => (x === l.id ? null : l.id))} title="Definir de quem a pessoa é convidada"
                      className="ml-2 rounded-md px-2 py-0.5 text-xs font-semibold text-mrv-700 ring-1 ring-mrv-600/50 hover:bg-mrv-50">Convidado de…</button>
                  )}
                  {evento && reserva && (
                    <button disabled={ocupado} onClick={() => setPreenchendo((x) => (x === l.id ? null : l.id))}
                      className="ml-2 rounded-md px-2 py-0.5 text-xs font-semibold text-mrv-700 ring-1 ring-mrv-600 hover:bg-mrv-50">Preencher</button>
                  )}
                  {evento && l.status !== "cancelado" && l.status !== "presente" && l.status !== "no_show" && (
                    <button disabled={ocupado} onClick={() => rodar(() => cancelarIngresso(evento, l.id, reserva ? "Reserva cancelada" : "Cancelado pelo Admin"),
                      reserva ? `Cancelar a reserva para ${l.reservado_para}? O lugar volta para o saldo.` : `Cancelar ingresso de ${l.nome}? O lugar volta para o saldo.`)}
                      className="ml-2 rounded-md px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300 hover:bg-red-50">Cancelar</button>
                  )}
                </td>
              </tr>
              {evento && vinculando === l.id && (
                <tr className="bg-mrv-50/40">
                  <td colSpan={5} className="px-4 pb-3">
                    <DefinirAnfitriao nome={l.nome ?? ""} anfitrioes={anfitrioes.filter((a) => a.id !== l.id)}
                      inicial={l.convidado_de ? { ingresso: l.convidado_de } : l.anfitriao_externo ? { externo: l.anfitriao_externo } : {}}
                      fechar={() => setVinculando(null)}
                      salvar={async (a) => { const r = await definirConvidadoDe(evento, l.id, a); if (r.ok) setMsg({ ok: true, texto: r.mensagem ?? "" }); return r; }} />
                  </td>
                </tr>
              )}
              {evento && preenchendo === l.id && (
                <tr className="bg-laranja-100/40">
                  <td colSpan={5} className="px-4 pb-3">
                    <PreencherReserva para={l.reservado_para ?? ""} fechar={() => setPreenchendo(null)}
                      salvar={(d) => preencherReserva(evento, l.id, d)} />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {msg && <div className="px-4 pt-3"><Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso></div>}
    </div>
  );
}

/** Nome e CPF de quem vai usar a reserva (celular e e-mail opcionais). */
function PreencherReserva({ para, salvar, fechar }: {
  para: string; fechar: () => void;
  salvar: (d: { nome: string; cpf: string; celular: string; email: string }) => Promise<{ ok: boolean; mensagem?: string; erro?: string }>;
}) {
  const [d, setD] = useState({ nome: para, cpf: "", celular: "", email: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-laranja-700/30">
      <div className="mb-2 text-sm font-semibold">Preencher a reserva para {para}</div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Entrada aria-label="Nome completo" placeholder="Nome completo" value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} />
        <Entrada aria-label="CPF ou passaporte" placeholder="CPF ou passaporte" autoCapitalize="characters" value={d.cpf} onChange={(e) => setD({ ...d, cpf: e.target.value })} />
        <Entrada aria-label="Celular" placeholder="Celular (opcional)" inputMode="tel" value={d.celular} onChange={(e) => setD({ ...d, celular: e.target.value })} />
        <Entrada aria-label="E-mail" placeholder="E-mail (opcional)" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} />
      </div>
      {erro && <div className="mt-2"><Aviso tom="erro">{erro}</Aviso></div>}
      <div className="mt-2 flex gap-2">
        <Botao type="button" disabled={pendente || !d.nome.trim() || !d.cpf.trim()} onClick={() => iniciar(async () => {
          setErro(null);
          const r = await salvar(d);
          if (!r.ok) return setErro(r.erro ?? "Não foi possível salvar.");
          fechar();
        })}>{pendente ? "Salvando…" : "Salvar"}</Botao>
        <Botao type="button" variante="fantasma" onClick={fechar}>Voltar</Botao>
      </div>
    </div>
  );
}

