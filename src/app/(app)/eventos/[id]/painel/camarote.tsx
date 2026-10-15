"use client";
// Central de pedidos do camarote (Marketing): novo pedido com anfitrião, prioridade e catering;
// fila por prioridade em jogo concorrido; links para os convidados do anfitrião; histórico;
// entradas não listadas vindas da operação.
import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { BotaoCopiar, BotaoWhatsApp } from "@/components/copiar";
import { AreaTexto, Aviso, Botao, Campo, Entrada, Selecao, Selo } from "@/components/ui";
import { cpfValido, formatarCpf } from "@/lib/cpf";
import { dataHora } from "@/lib/formato";
import { linkWhatsApp } from "@/lib/mensagens";
import { separarLista } from "@/lib/parse-lista";
import type { Resultado } from "@/lib/erros";
import type { StatusIngresso } from "@/lib/tipos";
import {
  aprovarDaFila, atualizarPedido, criarPedidoCamarote, decidirWalkin, distribuirCamarote, historicoPedido, linkConvidadosAnfitriao,
} from "./actions";

export interface LinhaCamarote {
  id: string;
  pedido_id: string;
  area_nome: string;
  status: StatusIngresso;
  nome: string | null;
  cpf: string | null;
  convidado_de: string | null;
  convite_id: string | null;
  prioridade: "exec_presidencia" | "diretor" | "gestor" | null;
  catering: "corporativo" | "pessoal" | null;
  centro_custo: string | null;
  indicacao_de: string | null;
  pedido_observacao: string | null;
  lista_espera_desde: string | null;
  criado_em: string;
  chegada_em: string | null;
}

export interface Walkin {
  id: string;
  nome: string;
  cpf_mascarado: string | null;
  anfitriao: string | null;
  observacao: string | null;
  status: "pendente" | "aprovado" | "recusado";
  criado_em: string;
  registrado_por: string | null;
}

const PRIORIDADE = {
  exec_presidencia: { rotulo: "Dir. Executiva / Presidência", curto: "Exec./Presidência", ordem: 1 },
  diretor: { rotulo: "Diretor", curto: "Diretor", ordem: 2 },
  gestor: { rotulo: "Gestor executivo", curto: "Gestor", ordem: 3 },
} as const;

const ATIVOS: StatusIngresso[] = ["aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado", "presente", "convite_enviado", "aguardando_preenchimento"];

interface Pedido {
  id: string;
  anfitriao: LinhaCamarote;
  convidados: LinhaCamarote[];
  vagasLink: number;
  naFila: boolean;
}

function agrupar(linhas: LinhaCamarote[]): Pedido[] {
  const por = new Map<string, LinhaCamarote[]>();
  for (const l of linhas) por.set(l.pedido_id, [...(por.get(l.pedido_id) ?? []), l]);
  return [...por.entries()].flatMap(([id, ls]) => {
    const anfitriao = ls.find((l) => !l.convidado_de && l.nome) ?? ls.find((l) => l.nome);
    if (!anfitriao) return [];
    const convidados = ls.filter((l) => l !== anfitriao && l.nome);
    return [{ id, anfitriao, convidados, vagasLink: ls.filter((l) => !l.nome).length, naFila: anfitriao.status === "lista_espera" }];
  });
}

export function PainelCamarote({ evento, linhas, walkins, capacidade, concorrido, areas }: {
  evento: string; linhas: LinhaCamarote[]; walkins: Walkin[]; capacidade: number; concorrido: boolean; areas: { id: string; nome: string }[];
}) {
  const [novo, setNovo] = useState(false);
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<Resultado<unknown>>) =>
    iniciar(async () => {
      const r = await f();
      setRetorno(r.ok ? { ok: true, msg: r.mensagem ?? "Feito." } : { ok: false, msg: r.erro });
    });

  const pedidos = useMemo(() => agrupar(linhas.filter((l) => ATIVOS.includes(l.status) || l.status === "lista_espera")), [linhas]);
  const aprovados = pedidos.filter((p) => !p.naFila);
  const fila = pedidos.filter((p) => p.naFila).sort((a, b) =>
    (PRIORIDADE[a.anfitriao.prioridade ?? "gestor"]?.ordem ?? 4) - (PRIORIDADE[b.anfitriao.prioridade ?? "gestor"]?.ordem ?? 4)
    || (a.anfitriao.lista_espera_desde ?? "").localeCompare(b.anfitriao.lista_espera_desde ?? ""));
  const ocupados = linhas.filter((l) => ATIVOS.includes(l.status)).length;
  const naFila = fila.reduce((n, p) => n + 1 + p.convidados.length, 0);
  const chegaram = linhas.filter((l) => l.chegada_em).length;
  const pendentesPorta = walkins.filter((w) => w.status === "pendente");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Ocupados" valor={`${ocupados} / ${capacidade}`} />
        <Numero rotulo="Vagas livres" valor={Math.max(0, capacidade - ocupados)} />
        <Numero rotulo="Na fila" valor={naFila} laranja={naFila > 0} />
        <Numero rotulo="Chegaram" valor={chegaram} />
      </div>

      {concorrido && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#ffd9b3] bg-laranja-100 p-4">
          <div className="min-w-0 flex-1 text-sm text-[#5c3307]">
            <b>Jogo concorrido.</b> Os pedidos entram na fila e as vagas são distribuídas pela prioridade: Dir. Executiva e Presidência,
            depois Diretores, depois Gestores (e, entre iguais, quem pediu antes).
          </div>
          <Botao variante="laranja" disabled={pendente || !fila.length} onClick={() => rodar(() => distribuirCamarote(evento))}>
            Distribuir vagas pela prioridade
          </Botao>
        </div>
      )}

      {pendentesPorta.length > 0 && (
        <div className="rounded-2xl border-2 border-amarelo-500 bg-white p-4">
          <h3 className="mb-2 font-bold">Na porta, fora da lista ({pendentesPorta.length})</h3>
          <ul className="divide-y divide-borda">
            {pendentesPorta.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <b>{w.nome}</b> {w.cpf_mascarado && <span className="font-mono text-xs text-cinza">{w.cpf_mascarado}</span>}
                  <div className="text-xs text-cinza">Recebido por {w.anfitriao ?? "?"} · {w.observacao ?? "sem observação"} · registrado por {w.registrado_por ?? "operação"} às {dataHora(w.criado_em)}</div>
                </div>
                <Botao disabled={pendente} onClick={() => rodar(() => decidirWalkin(evento, w.id, true))}>Liberar entrada</Botao>
                <Botao variante="perigo" disabled={pendente} onClick={() => rodar(() => decidirWalkin(evento, w.id, false))}>Recusar</Botao>
              </li>
            ))}
          </ul>
        </div>
      )}

      {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">Pedidos do camarote</h2>
        <div className="flex gap-2">
          <a href={`/eventos/${evento}/camarote/imprimir`} target="_blank" rel="noopener"
            className="inline-flex min-h-10 items-center rounded-lg px-4 py-2 text-sm font-bold text-mrv-700 ring-1 ring-mrv-600 hover:bg-mrv-50">Imprimir lista</a>
          <Botao variante="laranja" onClick={() => setNovo((n) => !n)}>{novo ? "Fechar" : "+ Novo pedido de camarote"}</Botao>
        </div>
      </div>

      {novo && <NovoPedido evento={evento} areas={areas} aoConcluir={(msg) => { setNovo(false); setRetorno({ ok: true, msg }); }} />}

      {fila.length > 0 && (
        <section className="space-y-3">
          <h3 className="font-display text-[13px] font-bold tracking-[0.08em] text-laranja-700">NA FILA · ORDEM DE PRIORIDADE</h3>
          {fila.map((p, i) => <CartaoPedido key={p.id} evento={evento} p={p} posicao={i + 1} pendente={pendente} rodar={rodar} />)}
        </section>
      )}

      <section className="space-y-3">
        {fila.length > 0 && <h3 className="font-display text-[13px] font-bold tracking-[0.08em] text-cinza">APROVADOS</h3>}
        {aprovados.length === 0 ? <p className="py-6 text-center text-sm text-cinza">Nenhum pedido aprovado ainda.</p>
          : aprovados.map((p) => <CartaoPedido key={p.id} evento={evento} p={p} pendente={pendente} rodar={rodar} />)}
      </section>
    </div>
  );
}

function Numero({ rotulo, valor, laranja }: { rotulo: string; valor: number | string; laranja?: boolean }) {
  return (
    <div className={clsx("rounded-2xl border p-5", laranja ? "border-[#ffd9b3] bg-laranja-100" : "border-borda bg-white")}>
      <div className={clsx("text-[13px] font-semibold", laranja ? "text-[#8a4b0f]" : "text-cinza")}>{rotulo}</div>
      <div className={clsx("tabular mt-1 font-display text-[40px] leading-tight font-bold", laranja ? "text-laranja-700" : "text-mrv-700")}>{valor}</div>
    </div>
  );
}

const ROTULO_STATUS: Partial<Record<StatusIngresso, string>> = {
  lista_espera: "Na fila", aprovado: "Pendente facial", facial_pendente: "Pendente facial", facial_ok: "Pronto para envio",
  enviado: "Enviado", confirmado: "Recebido", presente: "Presente",
};

function CartaoPedido({ evento, p, posicao, pendente, rodar }: {
  evento: string; p: Pedido; posicao?: number; pendente: boolean; rodar: (f: () => Promise<Resultado<unknown>>) => void;
}) {
  const a = p.anfitriao;
  const [aba, setAba] = useState<null | "historico" | "editar" | "link">(null);
  const [historico, setHistorico] = useState<{ em: string; quem: string; oque: string }[] | null>(null);
  const [qtd, setQtd] = useState(2);
  const [link, setLink] = useState<string | null>(null);
  const [erroLink, setErroLink] = useState<string | null>(null);
  const [carregando, iniciar] = useTransition();
  const [edicao, setEdicao] = useState({ prioridade: a.prioridade ?? "gestor", catering: a.catering ?? "pessoal", centro_custo: a.centro_custo ?? "", observacao: a.pedido_observacao ?? "" });
  const total = 1 + p.convidados.length + p.vagasLink;

  return (
    <article className={clsx("overflow-hidden rounded-2xl border bg-white", p.naFila ? "border-[#ffd9b3]" : "border-borda")}>
      <header className="flex flex-wrap items-center gap-3 border-b border-[#edeeed] px-5 py-3">
        {posicao && <span className="font-display text-xl font-bold text-laranja-700">{posicao}º</span>}
        <div className="min-w-0 flex-1">
          <div className="font-bold">{a.nome} <span className="font-normal text-cinza">· anfitrião · {a.area_nome}</span></div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {a.prioridade && <Selo tom="azul">{PRIORIDADE[a.prioridade].curto}</Selo>}
            <Selo tom={a.catering === "corporativo" ? "verde" : "cinza"}>
              Catering {a.catering === "corporativo" ? `corporativo${a.centro_custo ? ` · ${a.centro_custo}` : ""}` : "pessoal"}
            </Selo>
            {a.indicacao_de && <Selo>Indicação: {a.indicacao_de}</Selo>}
            <Selo tom={p.naFila ? "laranja" : "verde"}>{total} lugar(es) · {ROTULO_STATUS[a.status] ?? a.status}</Selo>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {p.naFila && <Botao disabled={pendente} onClick={() => rodar(() => aprovarDaFila(evento, p.id))}>Aprovar</Botao>}
          {!p.naFila && <Botao variante="secundario" onClick={() => setAba(aba === "link" ? null : "link")}>Link p/ convidados</Botao>}
          <Botao variante="fantasma" onClick={() => setAba(aba === "editar" ? null : "editar")}>Editar</Botao>
          <Botao variante="fantasma" onClick={() => {
            setAba(aba === "historico" ? null : "historico");
            if (!historico) iniciar(async () => setHistorico(await historicoPedido(p.id)));
          }}>Histórico</Botao>
        </div>
      </header>

      <ul className="divide-y divide-[#edeeed] text-sm">
        {[a, ...p.convidados].map((l) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
            <span className={clsx("min-w-0 flex-1", l === a ? "font-semibold" : "pl-4")}>{l !== a && <span className="text-tinta/40">↳ </span>}{l.nome}</span>
            <span className="font-mono text-xs text-cinza">{l.cpf ? formatarCpf(l.cpf) : ""}</span>
            {l.chegada_em && <Selo tom="verde">Chegou {dataHora(l.chegada_em).split(" ")[1]}</Selo>}
          </li>
        ))}
        {p.vagasLink > 0 && <li className="px-5 py-2.5 text-sm text-cinza">↳ {p.vagasLink} vaga(s) aguardando os convidados preencherem pelo link</li>}
        {a.pedido_observacao && <li className="px-5 py-2.5 text-xs text-cinza">Obs.: {a.pedido_observacao}</li>}
      </ul>

      {aba === "link" && (
        <div className="space-y-2 border-t border-[#edeeed] bg-fundo px-5 py-4 text-sm">
          <p>Gere um link para o anfitrião mandar aos convidados dele. Cada um preenche nome, CPF e celular e entra aprovado, vinculado a <b>{a.nome}</b>.</p>
          <div className="flex flex-wrap items-end gap-2">
            <Campo rotulo="Lugares no link" className="w-36">
              <Selecao value={qtd} onChange={(e) => setQtd(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}</Selecao>
            </Campo>
            <Botao disabled={carregando} onClick={() => iniciar(async () => {
              const r = await linkConvidadosAnfitriao(evento, a.id, qtd);
              if (r.ok) { setLink(r.dados!.link); setErroLink(null); } else setErroLink(r.erro);
            })}>Gerar link</Botao>
          </div>
          {erroLink && <Aviso tom="erro">{erroLink}</Aviso>}
          {link && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-white px-2 py-1 text-xs">{link}</code>
              <BotaoCopiar texto={link} rotulo="Copiar link" />
              <BotaoWhatsApp link={linkWhatsApp(null, `Olá! Você foi convidado(a) por ${a.nome} para o camarote MRV. Preencha seus dados aqui: ${link}`)} />
            </div>
          )}
        </div>
      )}

      {aba === "editar" && (
        <div className="grid gap-3 border-t border-[#edeeed] bg-fundo px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo rotulo="Prioridade">
            <Selecao value={edicao.prioridade} onChange={(e) => setEdicao({ ...edicao, prioridade: e.target.value as typeof edicao.prioridade })}>
              {Object.entries(PRIORIDADE).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Catering (A&B)">
            <Selecao value={edicao.catering} onChange={(e) => setEdicao({ ...edicao, catering: e.target.value as typeof edicao.catering })}>
              <option value="corporativo">Corporativo (centro de custo)</option>
              <option value="pessoal">Pessoal (paga na Arena)</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Centro de custo"><Entrada value={edicao.centro_custo} disabled={edicao.catering !== "corporativo"} onChange={(e) => setEdicao({ ...edicao, centro_custo: e.target.value })} /></Campo>
          <Campo rotulo="Observações"><Entrada value={edicao.observacao} onChange={(e) => setEdicao({ ...edicao, observacao: e.target.value })} /></Campo>
          <div className="sm:col-span-2 lg:col-span-4">
            <Botao disabled={pendente} onClick={() => rodar(() => atualizarPedido(evento, p.id, {
              prioridade: edicao.prioridade, catering: edicao.catering,
              centro_custo: edicao.catering === "corporativo" ? edicao.centro_custo : null, observacao: edicao.observacao,
            }))}>Salvar alterações</Botao>
          </div>
        </div>
      )}

      {aba === "historico" && (
        <div className="border-t border-[#edeeed] bg-fundo px-5 py-4 text-sm">
          {!historico ? <p className="text-cinza">Carregando…</p> : (
            <ol className="space-y-1.5">
              {historico.map((h, i) => (
                <li key={i} className="flex gap-3">
                  <span className="tabular shrink-0 text-xs text-cinza">{dataHora(h.em)}</span>
                  <span><b>{h.quem}</b> · {h.oque}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}

function NovoPedido({ evento, areas, aoConcluir }: { evento: string; areas: { id: string; nome: string }[]; aoConcluir: (msg: string) => void }) {
  const [anfitriao, setAnfitriao] = useState({ nome: "", cpf: "" });
  const [area, setArea] = useState(areas[0]?.id ?? "");
  const [prioridade, setPrioridade] = useState<"exec_presidencia" | "diretor" | "gestor">("diretor");
  const [presente, setPresente] = useState(true);
  const [texto, setTexto] = useState("");
  const [indicacao, setIndicacao] = useState("");
  const [catering, setCatering] = useState<"corporativo" | "pessoal">("corporativo");
  const [cc, setCc] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const convidados = useMemo(() => separarLista(texto).map((l) => ({ ...l, problemas: l.problemas.filter((x) => x !== "sem celular") })), [texto]);
  const anfitriaoOk = anfitriao.nome.trim().split(/\s+/).length >= 2 && cpfValido(anfitriao.cpf);
  const ok = anfitriaoOk && presente && convidados.every((c) => !c.problemas.length) && (catering === "pessoal" || cc.trim());

  return (
    <div className="space-y-4 rounded-2xl border-2 border-laranja-500/40 bg-white p-5">
      <h3 className="font-bold">Novo pedido de camarote</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Anfitrião (colaborador MRV)"><Entrada value={anfitriao.nome} onChange={(e) => setAnfitriao({ ...anfitriao, nome: e.target.value })} placeholder="Nome completo" /></Campo>
        <Campo rotulo="CPF do anfitrião" erro={anfitriao.cpf && !cpfValido(anfitriao.cpf) ? "CPF inválido" : null}>
          <Entrada value={anfitriao.cpf} inputMode="numeric" onChange={(e) => setAnfitriao({ ...anfitriao, cpf: e.target.value })} onBlur={(e) => cpfValido(e.target.value) && setAnfitriao({ ...anfitriao, cpf: formatarCpf(e.target.value) })} />
        </Campo>
        <Campo rotulo="Área / diretoria"><Selecao value={area} onChange={(e) => setArea(e.target.value)}>{areas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</Selecao></Campo>
        <Campo rotulo="Prioridade">
          <Selecao value={prioridade} onChange={(e) => setPrioridade(e.target.value as typeof prioridade)}>
            {Object.entries(PRIORIDADE).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
          </Selecao>
        </Campo>
      </div>

      <fieldset className="flex flex-wrap items-center gap-4 text-sm">
        <legend className="mb-1 font-semibold">O anfitrião vai estar no camarote durante o jogo?</legend>
        <label className="flex items-center gap-2"><input type="radio" checked={presente} onChange={() => setPresente(true)} className="accent-mrv-700" /> Sim</label>
        <label className="flex items-center gap-2"><input type="radio" checked={!presente} onChange={() => setPresente(false)} className="accent-mrv-700" /> Não</label>
      </fieldset>
      {!presente && (
        <Aviso tom="alerta">
          O camarote é corporativo: quem pede precisa estar presente, e o ingresso não pode ser repassado. Para família ou amigos sem o
          anfitrião, use a <b>arquibancada</b>: feche este formulário, troque para a aba Arquibancada e use “Adicionar nomes”.
        </Aviso>
      )}

      <Campo rotulo="Convidados (um por linha, nome e CPF — pode colar do WhatsApp)">
        <AreaTexto rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Investidor Fulano 123.456.789-09\nParceira Beltrana; 98765432100"} />
      </Campo>
      {convidados.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg bg-fundo p-2 text-sm">
          {convidados.map((c, i) => (
            <li key={i} className="flex justify-between gap-2"><span>↳ <b>{c.nome || "(sem nome)"}</b> <span className="font-mono text-xs text-cinza">{c.cpf ? formatarCpf(c.cpf) : ""}</span></span>
              {c.problemas.length ? <Selo tom="vermelho">{c.problemas.join(", ")}</Selo> : <Selo tom="verde">ok</Selo>}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-cinza">Sem os dados dos convidados agora? Lance só o anfitrião e, depois de aprovado, gere um link para ele mandar aos convidados.</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Catering (A&B)">
          <Selecao value={catering} onChange={(e) => setCatering(e.target.value as typeof catering)}>
            <option value="corporativo">Corporativo (centro de custo)</option>
            <option value="pessoal">Pessoal (paga na Arena)</option>
          </Selecao>
        </Campo>
        <Campo rotulo="Centro de custo" erro={catering === "corporativo" && !cc.trim() ? "Obrigatório no corporativo" : null}>
          <Entrada value={cc} disabled={catering !== "corporativo"} onChange={(e) => setCc(e.target.value)} />
        </Campo>
        <Campo rotulo="Indicação de"><Entrada value={indicacao} onChange={(e) => setIndicacao(e.target.value)} placeholder="ex.: Presidência" /></Campo>
        <Campo rotulo="Observações"><Entrada value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Botao disabled={!ok || pendente} onClick={() => iniciar(async () => {
        const r = await criarPedidoCamarote(evento, {
          area, prioridade, anfitriao, convidados: convidados.map((c) => ({ nome: c.nome, cpf: c.cpf! })),
          indicacaoDe: indicacao, catering, centroCusto: cc, observacao: obs,
        });
        if (r.ok) aoConcluir(r.mensagem ?? "Pedido lançado."); else setErro(r.erro);
      })}>
        {pendente ? "Lançando…" : `Lançar pedido (${1 + convidados.length} lugar(es))`}
      </Botao>
    </div>
  );
}
