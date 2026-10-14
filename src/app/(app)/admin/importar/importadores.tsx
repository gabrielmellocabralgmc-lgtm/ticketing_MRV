"use client";
import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { Aviso, Botao, Campo, Entrada, Selecao, Tabela } from "@/components/ui";
import { ROTULOS_FORMS, sugerirMapa, type CampoForms } from "@/lib/importacao/forms-mapa";
import { importarForms, importarPlanilha, lerForms } from "./actions";

export function ImportarPlanilha() {
  const [estado, acao, pendente] = useActionState(importarPlanilha, null);
  const [, iniciar] = useTransition();
  const previa = estado?.ok ? estado.dados : undefined;
  return (
    <form onSubmit={(e) => semReset(e, (f) => iniciar(() => acao(f)))} className="space-y-4">
      <Campo rotulo="Planilha MRV_TicketManagement_*.xlsx"><Entrada type="file" name="arquivo" accept=".xlsx" required /></Campo>
      {previa && !previa.eventoId && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Data e hora do jogo" dica="Lida do título; confira o horário"><Entrada type="datetime-local" name="inicio" defaultValue={previa.inicioSugerido} required /></Campo>
          <Campo rotulo="Competição"><Entrada name="competicao" /></Campo>
        </div>
      )}
      <div className="flex gap-2">
        <Botao type="submit" name="aplicar" value="0" variante="secundario" disabled={pendente}>{pendente ? "Lendo…" : "Ler e conferir"}</Botao>
        {previa && !previa.eventoId && <Botao type="submit" name="aplicar" value="1" disabled={pendente}>Importar “{previa.titulo}”</Botao>}
      </div>
      {estado && !estado.ok && <Aviso tom="erro">{estado.erro}</Aviso>}
      {previa && (
        <div className="space-y-3">
          {estado?.ok && estado.mensagem && <Aviso tom="ok">{estado.mensagem} {previa.eventoId && <Link className="font-semibold underline" href={`/eventos/${previa.eventoId}`}>Abrir evento →</Link>}</Aviso>}
          <p className="text-sm"><b>{previa.titulo}</b> · camarote disponibilizado: {previa.camaroteDisponibilizados ?? "—"} · vagas reservadas sem dados: {previa.vagas}</p>
          <Tabela>
            <thead><tr><th>Setor</th><th>Área</th><th className="text-right">Ingressos</th></tr></thead>
            <tbody>{previa.porArea.map((a) => <tr key={a.setor + a.area}><td>{a.setor}</td><td>{a.area}</td><td className="tabular text-right">{a.ingressos}</td></tr>)}</tbody>
          </Tabela>
          <ListaAvisos avisos={previa.avisos} />
        </div>
      )}
    </form>
  );
}

// Envia sem o reset automático do React 19 (o arquivo escolhido precisa continuar no campo)
function semReset(e: React.FormEvent<HTMLFormElement>, enviar: (f: FormData) => void) {
  e.preventDefault();
  const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  const f = new FormData(e.currentTarget);
  if (submitter?.name) f.set(submitter.name, submitter.value);
  enviar(f);
}

function ListaAvisos({ avisos }: { avisos: { tipo: string; linha?: string; mensagem: string }[] }) {
  if (!avisos.length) return <Aviso tom="ok">Nenhuma inconsistência encontrada.</Aviso>;
  const grupos = ["erro", "alerta", "info"] as const;
  return (
    <div className="space-y-2">
      {grupos.map((g) => {
        const lista = avisos.filter((a) => a.tipo === g);
        if (!lista.length) return null;
        return (
          <details key={g} open={g === "erro"} className="rounded-lg bg-fundo p-3 text-sm">
            <summary className="cursor-pointer font-semibold">{g === "erro" ? "Erros" : g === "alerta" ? "Alertas" : "Informações"} ({lista.length})</summary>
            <ul className="mt-2 space-y-1 text-xs">{lista.map((a, i) => <li key={i}>{a.linha && <span className="font-mono text-tinta/50">[{a.linha}] </span>}{a.mensagem}</li>)}</ul>
          </details>
        );
      })}
    </div>
  );
}

export function ImportarForms({ eventos, areas }: { eventos: { id: string; titulo: string }[]; areas: { id: string; nome: string }[] }) {
  const [estado, acao, lendo] = useActionState(lerForms, null);
  const [mapa, setMapa] = useState<Partial<Record<CampoForms, number>>>({});
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string; erros?: string[] } | null>(null);
  const [pendente, iniciar] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const previa = estado?.ok ? estado.dados : undefined;
  const [mapaDe, setMapaDe] = useState<string[] | null>(null);
  if (previa && previa.cabecalhos !== mapaDe) {
    setMapaDe(previa.cabecalhos);
    setMapa(sugerirMapa(previa.cabecalhos));
  }

  return (
    <form ref={ref} onSubmit={(e) => semReset(e, (f) => iniciar(() => acao(f)))} className="space-y-4">
      <Campo rotulo="Respostas do Forms (.xlsx ou .csv)"><Entrada type="file" name="arquivo" accept=".xlsx,.csv" required /></Campo>
      <Botao type="submit" variante="secundario" disabled={lendo}>{lendo ? "Lendo…" : "Ler colunas"}</Botao>
      {estado && !estado.ok && <Aviso tom="erro">{estado.erro}</Aviso>}
      {previa && (
        <div className="space-y-4">
          <p className="text-sm text-tinta/70">{previa.total} resposta(s). Confira qual coluna é cada campo:</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(ROTULOS_FORMS) as CampoForms[]).map((k) => (
              <Campo key={k} rotulo={ROTULOS_FORMS[k]}>
                <Selecao value={mapa[k] ?? ""} onChange={(e) => setMapa((m) => ({ ...m, [k]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                  <option value="">—</option>
                  {previa.cabecalhos.map((h, i) => <option key={i} value={i}>{h} {previa.amostra[0]?.[i] ? `(ex.: ${previa.amostra[0][i].slice(0, 24)})` : ""}</option>)}
                </Selecao>
              </Campo>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Evento"><Selecao name="evento" required>{eventos.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}</Selecao></Campo>
            <Campo rotulo="Setor"><Selecao name="setor"><option value="arquibancada">Arquibancada</option><option value="pista">Pista</option><option value="camarote">Camarote</option></Selecao></Campo>
            <Campo rotulo="Área" dica="Em branco: usa a coluna Área">
              <Selecao name="area_fixa"><option value="">Pela coluna “Área”</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Selecao>
            </Campo>
          </div>
          <Botao type="button" disabled={pendente} onClick={() => {
            const f = new FormData(ref.current!);
            f.set("mapa", JSON.stringify(mapa));
            iniciar(async () => {
              const r = await importarForms(f);
              setResultado(r.ok ? { ok: true, msg: r.mensagem ?? "", erros: r.dados?.erros } : { ok: false, msg: r.erro });
            });
          }}>
            {pendente ? "Importando…" : "Importar respostas"}
          </Botao>
          {resultado && <Aviso tom={resultado.ok ? "ok" : "erro"}>{resultado.msg}</Aviso>}
          {!!resultado?.erros?.length && <ul className="space-y-1 rounded-lg bg-fundo p-3 text-xs">{resultado.erros.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      )}
    </form>
  );
}
