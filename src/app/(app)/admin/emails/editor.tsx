"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { AreaTexto, Aviso, Botao, Campo, Entrada, Selo } from "@/components/ui";
import { dataHora } from "@/lib/formato";
import { EXEMPLO, VARIAVEIS, htmlEmail, preencher } from "@/lib/mensagens/modelos";
import { salvarModelo, testarModelo } from "./actions";

export interface Modelo { chave: string; nome: string; descricao: string; assunto: string; corpo: string; atualizado_em: string }
export interface Envio { id: number; tipo: string; para_nome: string | null; para_email: string; assunto: string; corpo: string; status: string; erro: string | null; criado_em: string }

export function EditorEmails({ modelos, envios, logoUrl, envioReal }: { modelos: Modelo[]; envios: Envio[]; logoUrl?: string; envioReal: boolean }) {
  const [aba, setAba] = useState<"modelos" | "saida">("modelos");
  const [atual, setAtual] = useState(modelos[0]?.chave);
  const [rascunhos, setRascunhos] = useState<Record<string, { assunto: string; corpo: string }>>(() => Object.fromEntries(modelos.map((m) => [m.chave, { assunto: m.assunto, corpo: m.corpo }])));
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [aberto, setAberto] = useState<Envio | null>(null);
  const [pendente, iniciar] = useTransition();
  const corpoRef = useRef<HTMLTextAreaElement>(null);
  const m = modelos.find((x) => x.chave === atual);
  const r = atual ? rascunhos[atual] : undefined;
  const alterado = !!m && !!r && (m.assunto !== r.assunto || m.corpo !== r.corpo);
  const html = useMemo(() => (r ? htmlEmail(preencher(r.corpo, EXEMPLO), { logoUrl, botao: { rotulo: "Abrir", url: EXEMPLO.link } }) : ""), [r, logoUrl]);
  const mudar = (campo: "assunto" | "corpo", v: string) => atual && setRascunhos((x) => ({ ...x, [atual]: { ...x[atual], [campo]: v } }));
  const inserir = (v: string) => {
    const el = corpoRef.current;
    if (!el || !r) return;
    const ini = el.selectionStart ?? r.corpo.length;
    mudar("corpo", r.corpo.slice(0, ini) + `{{${v}}}` + r.corpo.slice(el.selectionEnd ?? ini));
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["modelos", "saida"] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)} aria-pressed={aba === a}
            className={clsx("rounded-xl border px-4 py-2 text-sm font-bold", aba === a ? "border-mrv-700 bg-mrv-700 text-white" : "border-borda bg-white")}>
            {a === "modelos" ? "Modelos" : `Caixa de saída (${envios.length})`}
          </button>
        ))}
      </div>
      {!envioReal && <Aviso tom="info">Envio real desligado (falta configurar o Resend). Os e-mails ficam aqui na caixa de saída como “simulado”.</Aviso>}

      {aba === "modelos" && m && r && (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]">
          <nav className="flex flex-col gap-1">
            {modelos.map((x) => (
              <button key={x.chave} onClick={() => setAtual(x.chave)}
                className={clsx("rounded-lg px-3 py-2 text-left text-sm", x.chave === atual ? "bg-mrv-50 font-semibold text-mrv-700" : "hover:bg-white")}>
                {x.nome}
              </button>
            ))}
          </nav>
          <div className="space-y-3 rounded-2xl border border-borda bg-white p-4">
            <p className="text-sm text-cinza">{m.descricao}</p>
            <Campo rotulo="Assunto"><Entrada value={r.assunto} onChange={(e) => mudar("assunto", e.target.value)} /></Campo>
            <Campo rotulo="Texto"><AreaTexto ref={corpoRef} rows={16} value={r.corpo} onChange={(e) => mudar("corpo", e.target.value)} className="font-mono text-[13px]" /></Campo>
            <div>
              <div className="mb-1 text-xs font-semibold text-cinza">Inserir variável (clique):</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(VARIAVEIS).map(([k, d]) => (
                  <button key={k} type="button" title={d} onClick={() => inserir(k)} className="rounded-md bg-fundo px-2 py-1 font-mono text-xs hover:bg-mrv-50">{`{{${k}}}`}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Botao disabled={!alterado || pendente} onClick={() => iniciar(async () => { const x = await salvarModelo(m.chave, r.assunto, r.corpo); setRetorno({ ok: x.ok, msg: x.ok ? x.mensagem ?? "" : x.erro }); })}>Salvar</Botao>
              <Botao variante="secundario" disabled={pendente} onClick={() => iniciar(async () => { const x = await testarModelo(m.chave, r.assunto, r.corpo); setRetorno({ ok: x.ok, msg: x.ok ? x.mensagem ?? "" : x.erro }); })}>Enviar teste para mim</Botao>
              {alterado && <Botao variante="fantasma" onClick={() => mudar("corpo", m.corpo) || mudar("assunto", m.assunto)}>Descartar</Botao>}
            </div>
            {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}
            <p className="text-xs text-cinza">Última alteração salva: {dataHora(m.atualizado_em)}</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-borda bg-white">
            <div className="border-b border-borda px-4 py-2 text-sm"><span className="text-cinza">Prévia com dados de exemplo · </span><b>{preencher(r.assunto, EXEMPLO)}</b></div>
            <iframe title="Prévia do e-mail" srcDoc={html} sandbox="allow-same-origin" className="h-[640px] w-full" />
          </div>
        </div>
      )}

      {aba === "saida" && (
        <div className="overflow-x-auto rounded-2xl border border-borda bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="bg-[#fafafa] text-left text-xs tracking-wide text-cinza uppercase"><th className="px-4 py-2">Quando</th><th className="px-4 py-2">Para</th><th className="px-4 py-2">Assunto</th><th className="px-4 py-2">Tipo</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody>
              {envios.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-cinza">Nenhum e-mail ainda.</td></tr>}
              {envios.map((e) => (
                <tr key={e.id} className="cursor-pointer border-t border-[#edeeed] hover:bg-mrv-50/50" onClick={() => setAberto(e)}>
                  <td className="px-4 py-2 whitespace-nowrap">{dataHora(e.criado_em)}</td>
                  <td className="px-4 py-2">{e.para_nome ?? ""} <span className="text-cinza">{e.para_email}</span></td>
                  <td className="px-4 py-2">{e.assunto}</td>
                  <td className="px-4 py-2 text-xs">{modelos.find((x) => x.chave === e.tipo)?.nome ?? e.tipo}</td>
                  <td className="px-4 py-2"><Selo tom={e.status === "enviado" ? "verde" : e.status === "simulado" ? "azul" : "vermelho"}>{e.status}</Selo>{e.erro && <div className="text-xs text-red-700">{e.erro}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="E-mail enviado">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white">
            <div className="flex items-start justify-between gap-3 border-b border-borda p-4 text-sm">
              <div><div><span className="text-cinza">Para:</span> {aberto.para_email}</div><div className="font-semibold">{aberto.assunto}</div></div>
              <Botao variante="fantasma" onClick={() => setAberto(null)}>Fechar</Botao>
            </div>
            <iframe title="E-mail" srcDoc={htmlEmail(aberto.corpo, { logoUrl })} sandbox="allow-same-origin" className="h-[70vh] w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
