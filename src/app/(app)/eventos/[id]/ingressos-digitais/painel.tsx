"use client";
import { useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { BotaoCopiar } from "@/components/copiar";
import { AreaTexto, Aviso, Botao, Selo, SeloStatus } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { dataHora } from "@/lib/formato";
import { linkTorcedor } from "@/lib/mensagens";
import { type Setor, type StatusIngresso } from "@/lib/tipos";
import { colarLinks, desatribuir, distribuir, enviar, liberarResgate, liberarSemEmail, remover, subirPdf } from "./actions";
import { NomeSetor } from "@/components/setores";

export interface Digital {
  id: string; setor: Setor; tipo: "pdf" | "link"; url: string | null; nome_arquivo: string | null;
  titular_nome: string | null; titular_cpf: string | null; ingresso_id: string | null;
  atribuido_em: string | null; enviado_em: string | null; criado_em: string;
  resgate_aberto_em?: string | null; resgate_vezes?: number;
}
export interface Convidado {
  id: string; nome: string | null; cpf: string | null; email: string | null; setor: Setor;
  status: StatusIngresso; area_nome: string; token: string;
}

const PRONTOS: StatusIngresso[] = ["facial_ok", "enviado", "confirmado"];

export function PainelDigitais({ evento, setores, digitais, convidados, resgate = false }: { evento: string; setores: Setor[]; digitais: Digital[]; convidados: Convidado[]; resgate?: boolean }) {
  const [setor, setSetor] = useState<Setor>(setores[0] ?? "pista");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>, confirmar?: string) => {
    if (confirmar && !confirm(confirmar)) return;
    iniciar(async () => { const r = await f(); setMsg({ ok: r.ok, texto: (r.ok ? r.mensagem : r.erro) ?? "Feito." }); });
  };

  const porConvidado = new Map(convidados.map((c) => [c.id, c]));
  const doSetor = digitais.filter((d) => d.setor === setor);
  const atribuidos = new Set(digitais.filter((d) => d.ingresso_id).map((d) => d.ingresso_id!));
  const convSetor = convidados.filter((c) => c.setor === setor);
  const livres = doSetor.filter((d) => !d.ingresso_id).length;
  const enviados = doSetor.filter((d) => d.enviado_em).length;
  const semIngresso = convSetor.filter((c) => PRONTOS.includes(c.status) && !atribuidos.has(c.id));
  const paraEnviar = doSetor.filter((d) => d.ingresso_id && !d.enviado_em && porConvidado.get(d.ingresso_id)?.status === "facial_ok");
  const semEmail = paraEnviar.filter((d) => !porConvidado.get(d.ingresso_id!)?.email);
  const aguardando = convSetor.filter((c) => !PRONTOS.includes(c.status) && c.status !== "presente").length;

  return (
    <div className="space-y-5">
      {setores.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {setores.map((s) => (
            <button key={s} onClick={() => setSetor(s)} aria-pressed={s === setor}
              className={clsx("rounded-full px-4 py-2 text-sm font-semibold", s === setor ? "bg-mrv-700 text-white" : "bg-white text-mrv-700 ring-1 ring-borda hover:bg-mrv-50")}>
              <NomeSetor s={s} />
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="No estoque (livres)" valor={livres} />
        <Numero rotulo="Convidados sem ingresso" valor={semIngresso.length} alerta={semIngresso.length > livres} />
        <Numero rotulo="Prontos para enviar" valor={paraEnviar.length} />
        <Numero rotulo="Enviados" valor={enviados} />
      </div>

      {msg && <Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso>}

      <section className="rounded-2xl border border-borda bg-white p-5">
        <h2 className="mb-1 text-lg font-bold">1. Subir ingressos · <NomeSetor s={setor} /></h2>
        <p className="mb-4 text-sm text-cinza">
          Marque <b>“nominais”</b> quando cada ingresso já vier com o nome da pessoa: o sistema lê o nome e/ou o CPF do nome do arquivo
          (ex.: <i>Maria Souza - 123.456.789-09.pdf</i>) ou da linha colada, e entrega para essa pessoa. Sem marcar, os ingressos são genéricos.
        </p>
        <div className="grid gap-5 lg:grid-cols-2">
          <SubirPdfs evento={evento} setor={setor} aoTerminar={(t) => setMsg(t)} />
          <ColarLinks evento={evento} setor={setor} aoTerminar={(t) => setMsg(t)} />
        </div>
      </section>

      <section className="rounded-2xl border border-borda bg-white p-5">
        <h2 className="mb-1 text-lg font-bold">2. Distribuir e enviar</h2>
        <p className="mb-4 text-sm text-cinza">
          Distribuir dá um ingresso a cada convidado <b>pronto para envio</b> (nominais primeiro, pelo CPF ou nome; depois os genéricos).
          {resgate
            ? <>Enviar manda o e-mail com o passo a passo e o botão <b>“Ver passo a passo e resgatar”</b> (o link da Eventim não vai no e-mail) e marca como <b>Enviado</b>.</>
            : <>Enviar manda o e-mail com <b>“Baixar meu ingresso”</b> e marca como <b>Enviado</b>.</>}
          {aguardando > 0 && <> Há <b>{aguardando}</b> convidado(s) ainda em validação/facial: eles entram quando ficarem prontos.</>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Botao variante="secundario" disabled={pendente} onClick={() => rodar(() => distribuir(evento))}>Distribuir ingressos</Botao>
          <Botao disabled={pendente || !paraEnviar.length}
            onClick={() => rodar(() => enviar(evento), `Enviar ${paraEnviar.length} ingresso(s) por e-mail agora?`)}>
            {pendente ? "Processando…" : `Enviar ingressos (${paraEnviar.length})`}
          </Botao>
        </div>
        {semEmail.length > 0 && (
          <div className="mt-3"><Aviso tom="alerta">{semEmail.length} convidado(s) sem e-mail: não recebem pelo e-mail. Na tabela abaixo, copie o <b>Link do ingresso</b>, mande pelo WhatsApp e clique em <b>Marcar como enviado</b>.</Aviso></div>
        )}
        {semIngresso.length > 0 && (
          <p className="mt-3 text-sm text-laranja-700">
            Sem ingresso: {semIngresso.slice(0, 8).map((c) => c.nome ?? "—").join(", ")}{semIngresso.length > 8 ? ` e mais ${semIngresso.length - 8}` : ""}.
            {livres > 0 ? " Clique em Distribuir." : " Suba mais ingressos."}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-borda bg-white">
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold tracking-wide text-cinza uppercase">
                {["Ingresso", "Nominal para", "Entregue a", "Situação", ""].map((h) => <th key={h} className="sticky top-0 bg-[#fafafa] px-3 py-2">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {doSetor.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-cinza">Nenhum ingresso neste setor ainda.</td></tr>}
              {doSetor.map((d) => {
                const c = d.ingresso_id ? porConvidado.get(d.ingresso_id) : undefined;
                return (
                  <tr key={d.id} className="border-t border-[#edeeed] align-top">
                    <td className="max-w-64 px-3 py-2">
                      <Selo tom={d.tipo === "pdf" ? "azul" : "cinza"}>{d.tipo === "pdf" ? "PDF" : "Link"}</Selo>{" "}
                      <span className="break-all text-xs">{d.nome_arquivo ?? (resgate && d.tipo === "link" ? `🔒 ${d.url ?? "link"}` : d.url)}</span>
                    </td>
                    <td className="px-3 py-2 text-xs">{d.titular_nome || d.titular_cpf ? <>{d.titular_nome}{d.titular_cpf && <div className="font-mono">{formatarCpf(d.titular_cpf)}</div>}</> : <span className="text-cinza">genérico</span>}</td>
                    <td className="px-3 py-2">
                      {c ? <><div className="font-medium">{c.nome}</div><div className="text-xs text-cinza">{c.area_nome}{c.email ? ` · ${c.email}` : " · sem e-mail"}</div></> : <span className="text-cinza">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {resgate && d.resgate_aberto_em ? <Selo tom={c?.status === "confirmado" ? "verde" : "amarelo"}>{c?.status === "confirmado" ? "✓ No app · " : "Resgatado "}{dataHora(d.resgate_aberto_em)}</Selo>
                        : d.enviado_em ? <Selo tom="verde">Enviado {dataHora(d.enviado_em)}</Selo> : c ? <SeloStatus status={c.status} /> : <Selo>Livre</Selo>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {!(resgate && d.tipo === "link") && (
                          <a href={`/eventos/${evento}/ingressos-digitais/arquivo/${d.id}`} target="_blank" rel="noopener noreferrer"
                            className="rounded-md px-2 py-1 text-xs font-semibold text-mrv-700 ring-1 ring-mrv-600/30 hover:bg-mrv-50">Ver</a>
                        )}
                        {resgate && d.resgate_aberto_em && c?.status !== "confirmado" && (
                          <button disabled={pendente} onClick={() => rodar(() => liberarResgate(evento, d.id), `Liberar um novo resgate para ${c?.nome ?? "este convidado"}? Faça isso só se o ingresso NÃO apareceu no app dele (confira com a pessoa).`)}
                            className="text-xs font-semibold text-mrv-700 hover:underline">liberar novo resgate</button>
                        )}
                        {c && <BotaoCopiar texto={`${linkTorcedor(c.token)}/ingresso`} rotulo="Link do ingresso" />}
                        {c && !d.enviado_em && c.status === "facial_ok" && (
                          <button disabled={pendente} onClick={() => rodar(() => liberarSemEmail(evento, c.id), `Já mandou o ingresso de ${c.nome} por fora (WhatsApp etc.)? Marcar como enviado?`)}
                            className="rounded-md bg-[#25D366]/15 px-2 py-1 text-xs font-semibold text-[#0d7a3a] hover:bg-[#25D366]/25">Marcar como enviado</button>
                        )}
                        {!d.enviado_em && c && <button disabled={pendente} onClick={() => rodar(() => desatribuir(evento, d.id))} className="text-xs text-cinza hover:underline">devolver ao estoque</button>}
                        {!d.enviado_em && <button disabled={pendente} onClick={() => rodar(() => remover(evento, d.id), "Remover este ingresso do estoque?")} className="text-xs text-red-700 hover:underline">remover</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Numero({ rotulo, valor, alerta }: { rotulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className={clsx("rounded-2xl border p-4", alerta ? "border-[#ffd9b3] bg-laranja-100" : "border-borda bg-white")}>
      <div className="text-[13px] font-semibold text-cinza">{rotulo}</div>
      <div className={clsx("tabular font-display text-3xl font-bold", alerta ? "text-laranja-700" : "text-mrv-700")}>{valor}</div>
    </div>
  );
}

function SubirPdfs({ evento, setor, aoTerminar }: { evento: string; setor: Setor; aoTerminar: (m: { ok: boolean; texto: string }) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [nominal, setNominal] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const subir = (arquivos: FileList | null) => {
    if (!arquivos?.length) return;
    const lista = Array.from(arquivos);
    iniciar(async () => {
      const erros: string[] = [];
      for (const [i, a] of lista.entries()) {
        setProgresso(`Enviando ${i + 1} de ${lista.length}…`);
        const f = new FormData();
        f.set("evento", evento); f.set("setor", setor); f.set("nominal", nominal ? "1" : "0"); f.set("arquivo", a);
        const r = await subirPdf(f);
        if (!r.ok) erros.push(r.erro);
      }
      setProgresso(null);
      if (input.current) input.current.value = "";
      aoTerminar(erros.length
        ? { ok: false, texto: `${lista.length - erros.length} de ${lista.length} PDF(s) adicionados. Problemas: ${erros.slice(0, 3).join(" · ")}` }
        : { ok: true, texto: `${lista.length} PDF(s) adicionados ao estoque.` });
    });
  };
  return (
    <div className="rounded-xl bg-fundo p-4">
      <div className="mb-2 font-semibold">PDFs</div>
      <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={nominal} onChange={(e) => setNominal(e.target.checked)} className="accent-mrv-700" /> São nominais (nome/CPF no nome do arquivo)</label>
      <Botao variante="secundario" disabled={!!progresso} onClick={() => input.current?.click()}>{progresso ?? "Escolher PDFs…"}</Botao>
      <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => subir(e.target.files)} />
      <p className="mt-2 text-xs text-cinza">Pode selecionar vários de uma vez. Até 4 MB cada.</p>
    </div>
  );
}

function ColarLinks({ evento, setor, aoTerminar }: { evento: string; setor: Setor; aoTerminar: (m: { ok: boolean; texto: string }) => void }) {
  const [texto, setTexto] = useState("");
  const [nominal, setNominal] = useState(false);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="rounded-xl bg-fundo p-4">
      <div className="mb-2 font-semibold">Links</div>
      <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={nominal} onChange={(e) => setNominal(e.target.checked)} className="accent-mrv-700" /> São nominais (nome/CPF na mesma linha)</label>
      <AreaTexto rows={4} value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder={nominal ? "Maria Souza; 123.456.789-09; https://…\nJoão Lima; https://…" : "https://…\nhttps://…"} aria-label="Links dos ingressos, um por linha" />
      <Botao className="mt-2" variante="secundario" disabled={pendente || !texto.trim()}
        onClick={() => iniciar(async () => {
          const r = await colarLinks(evento, setor, texto, nominal);
          aoTerminar({ ok: r.ok, texto: (r.ok ? r.mensagem : r.erro) ?? "" });
          if (r.ok) setTexto("");
        })}>
        {pendente ? "Adicionando…" : "Adicionar links"}
      </Botao>
    </div>
  );
}
