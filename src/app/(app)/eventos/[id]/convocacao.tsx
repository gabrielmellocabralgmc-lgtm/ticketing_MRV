"use client";
// E-mails para as áreas: convocação (com prévia e teste) e lembretes.
import { useState, useTransition } from "react";
import { Aviso, Botao, Selo, Tabela } from "@/components/ui";
import { dataHora } from "@/lib/formato";
import { type Setor } from "@/lib/tipos";
import { enviarConvocacao, enviarConvocacaoFaltantes, previaConvocacao, removerAnexoConvocacao, rodarLembretes, subirAnexoConvocacao } from "./emails-actions";
import { NomeSetor } from "@/components/setores";

interface Area {
  area_id: string;
  area_nome: string;
  cotas: { setor: Setor; cota: number; ocupados: number; solicitados: number }[];
  responsaveis: { nome: string; email: string; recebeu?: boolean }[];
  ultima_convocacao: string | null;
  ultimo_lembrete: string | null;
}

export function Convocacao({ evento, areas, envioReal, facial = true, anexo = null }: {
  evento: string; areas: Area[]; envioReal: boolean; facial?: boolean;
  /** PDF que pode ir anexado na convocação (o mesmo para todos os eventos). */
  anexo?: { nome: string; tamanho: number } | null;
}) {
  const [anexar, setAnexar] = useState(!!anexo);
  const [sel, setSel] = useState<Set<string>>(() => new Set(areas.filter((a) => !a.ultima_convocacao && a.responsaveis.length).map((a) => a.area_id)));
  const [previa, setPrevia] = useState<{ assunto: string; html: string; para: string } | null>(null);
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>) =>
    iniciar(async () => { const r = await f(); setRetorno({ ok: r.ok, msg: (r.ok ? r.mensagem : r.erro) ?? "" }); });
  const subir = (f: File | undefined) => {
    if (!f) return;
    const fd = new FormData();
    fd.set("arquivo", f);
    rodar(async () => { const r = await subirAnexoConvocacao(evento, fd); if (r.ok) setAnexar(true); return r; });
  };
  const lista = [...sel];
  const comAnexo = anexar && !!anexo;

  return (
    <div className="space-y-3">
      {!envioReal && (
        <Aviso tom="info">Envio real desligado (sem a chave do Resend): os e-mails ficam registrados em <b>E-mails › Caixa de saída</b> como “simulado”, para você ver exatamente o que sairia.</Aviso>
      )}
      <Tabela>
        <thead>
          <tr>
            <th className="w-8"><input type="checkbox" aria-label="Selecionar todas" className="accent-mrv-700" checked={sel.size === areas.length && areas.length > 0}
              onChange={(e) => setSel(e.target.checked ? new Set(areas.map((a) => a.area_id)) : new Set())} /></th>
            <th>Área</th><th>Responsáveis</th><th>Cota</th><th>Convocação</th><th>Lembrete</th><th />
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => (
            <tr key={a.area_id}>
              <td><input type="checkbox" aria-label={`Selecionar ${a.area_nome}`} className="accent-mrv-700" checked={sel.has(a.area_id)}
                onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(a.area_id); else n.delete(a.area_id); return n; })} /></td>
              <td className="font-medium">{a.area_nome}</td>
              <td className="text-xs">
                {a.responsaveis.length ? a.responsaveis.map((r) => (
                  <div key={r.email}>
                    {r.nome} <span className="text-cinza">{r.email}</span>
                    {a.ultima_convocacao && !r.recebeu && <> <Selo tom="amarelo">ainda não recebeu</Selo></>}
                  </div>
                )) : <Selo tom="vermelho">sem responsável</Selo>}
                {a.ultima_convocacao && a.responsaveis.some((r) => !r.recebeu) && (
                  <button className="mt-1 text-xs font-semibold text-mrv-700 hover:underline" disabled={pendente}
                    onClick={() => {
                      const nomes = a.responsaveis.filter((r) => !r.recebeu).map((r) => r.nome).join(", ");
                      if (confirm(`Enviar a convocação de ${a.area_nome} só para ${nomes}? Quem já recebeu não recebe de novo.`)) rodar(() => enviarConvocacaoFaltantes(evento, a.area_id, comAnexo));
                    }}>
                    Enviar só para quem falta
                  </button>
                )}
              </td>
              <td className="text-xs whitespace-nowrap">{a.cotas.map((c) => <div key={c.setor}>{c.cota} · <NomeSetor s={c.setor} curto /> <span className="text-cinza">({c.ocupados} usados)</span></div>)}</td>
              <td className="text-xs whitespace-nowrap">{a.ultima_convocacao ? <Selo tom="verde">{dataHora(a.ultima_convocacao)}</Selo> : <span className="text-cinza">não enviada</span>}</td>
              <td className="text-xs whitespace-nowrap">{a.ultimo_lembrete ? dataHora(a.ultimo_lembrete) : "—"}</td>
              <td><button className="text-xs font-semibold text-mrv-700 hover:underline" onClick={() => iniciar(async () => setPrevia(await previaConvocacao(evento, a.area_id)))}>Prévia</button></td>
            </tr>
          ))}
        </tbody>
      </Tabela>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-fundo p-3 text-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-mrv-700"><path d="M21.4 11.6 12.2 20.8a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>
        {anexo ? (
          <>
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" className="size-4 accent-mrv-700" checked={anexar} onChange={(e) => setAnexar(e.target.checked)} />
              Anexar <b className="break-all">{anexo.nome}</b> <span className="font-normal text-cinza">({Math.max(1, Math.round(anexo.tamanho / 1024))} KB)</span>
            </label>
            <label className="cursor-pointer text-xs font-semibold text-mrv-700 hover:underline">
              Trocar PDF
              <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => subir(e.target.files?.[0])} />
            </label>
            <button className="text-xs text-red-700 hover:underline" disabled={pendente} onClick={() => confirm("Remover o PDF anexo?") && rodar(() => removerAnexoConvocacao(evento))}>remover</button>
          </>
        ) : (
          <label className="cursor-pointer font-semibold text-mrv-700 hover:underline">
            Anexar um PDF na convocação (ex.: o passo a passo para os gestores)
            <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => subir(e.target.files?.[0])} />
          </label>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Botao disabled={pendente || !lista.length} onClick={() => confirm(`Enviar a convocação para ${lista.length} área(s)${comAnexo ? `, com o PDF ${anexo!.nome} anexado` : ""}?`) && rodar(() => enviarConvocacao(evento, lista, false, comAnexo))}>
          Enviar convocação ({lista.length})
        </Botao>
        <Botao variante="secundario" disabled={pendente || !lista.length} onClick={() => rodar(() => enviarConvocacao(evento, lista, true, comAnexo))}>Enviar teste para mim</Botao>
        <Botao variante="fantasma" disabled={pendente} onClick={() => rodar(() => rodarLembretes(evento))}>Rodar lembretes agora</Botao>
      </div>
      <p className="text-xs text-cinza">
        Lembretes automáticos: às áreas com saldo ou pedidos sem validar, nas últimas 24 h antes do prazo (uma vez){facial ? ", e aos convidados com a facial pendente no D-2 e D-1" : ""}.
      </p>
      {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}
      {previa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Prévia do e-mail">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white">
            <div className="flex items-start justify-between gap-3 border-b border-borda p-4">
              <div className="min-w-0 text-sm">
                <div><span className="text-cinza">Para:</span> {previa.para}</div>
                <div className="font-semibold"><span className="font-normal text-cinza">Assunto:</span> {previa.assunto}</div>
              </div>
              <Botao variante="fantasma" onClick={() => setPrevia(null)}>Fechar</Botao>
            </div>
            <iframe title="Prévia do e-mail" srcDoc={previa.html} sandbox="allow-same-origin" className="h-[70vh] w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
