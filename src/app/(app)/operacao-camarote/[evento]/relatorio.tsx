"use client";
import { useState, useTransition } from "react";
import { AreaTexto, Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { dataHora } from "@/lib/formato";
import type { Foto, Relatorio } from "./dados";
import { salvarRelatorio } from "./actions";
import { EnviarFoto, Galeria } from "./fotos";

const CAMPOS: { id: "resumo" | "ocorrencias" | "manutencao" | "feedback"; rotulo: string; dica: string }[] = [
  { id: "resumo", rotulo: "Resumo do jogo", dica: "Como foi a operação no geral: lotação, ritmo, serviço de A&B." },
  { id: "ocorrencias", rotulo: "Ocorrências", dica: "Incidentes, convidados não listados, atrasos, reclamações." },
  { id: "manutencao", rotulo: "Manutenção e pendências", dica: "O que precisa ser consertado/reposto antes do próximo jogo." },
  { id: "feedback", rotulo: "Feedback de convidados", dica: "Elogios e sugestões recebidos." },
];

export function RelatorioJogo({ evento, inicial, fotos, checklistsConcluidos }: { evento: string; inicial: Relatorio | null; fotos: Foto[]; checklistsConcluidos: boolean }) {
  const [d, setD] = useState({
    abertura_camarote: inicial?.abertura_camarote?.slice(0, 5) ?? "", encerramento_camarote: inicial?.encerramento_camarote?.slice(0, 5) ?? "",
    avaliacao: inicial?.avaliacao?.toString() ?? "", resumo: inicial?.resumo ?? "", ocorrencias: inicial?.ocorrencias ?? "",
    manutencao: inicial?.manutencao ?? "", feedback: inicial?.feedback ?? "",
  });
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const finalizado = !!inicial?.finalizado_em;
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>) =>
    iniciar(async () => { const r = await f(); setMsg({ ok: r.ok, texto: (r.ok ? r.mensagem : r.erro) ?? "" }); });

  return (
    <div className="space-y-4">
      {finalizado && (
        <Aviso tom="ok">
          Relatório enviado em {dataHora(inicial!.finalizado_em)} para a operação e os Admins. Depois de enviado, nada deste jogo pode ser alterado.
        </Aviso>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Abertura do camarote"><Entrada type="time" value={d.abertura_camarote} disabled={finalizado} onChange={(e) => setD({ ...d, abertura_camarote: e.target.value })} /></Campo>
        <Campo rotulo="Encerramento do camarote"><Entrada type="time" value={d.encerramento_camarote} disabled={finalizado} onChange={(e) => setD({ ...d, encerramento_camarote: e.target.value })} /></Campo>
        <Campo rotulo="Avaliação geral da operação">
          <div className="flex gap-1" role="radiogroup" aria-label="Avaliação de 1 a 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" disabled={finalizado} role="radio" aria-checked={d.avaliacao === String(n)} onClick={() => setD({ ...d, avaliacao: String(n) })}
                className={`size-10 rounded-lg text-sm font-bold ring-1 ${Number(d.avaliacao) >= n ? "bg-amarelo-500 text-tinta ring-amarelo-500" : "bg-white text-cinza ring-borda"}`}>{n}</button>
            ))}
          </div>
        </Campo>
      </div>
      {CAMPOS.map((c) => (
        <Campo key={c.id} rotulo={c.rotulo} dica={c.dica}>
          <AreaTexto rows={3} maxLength={5000} value={d[c.id]} disabled={finalizado} onChange={(e) => setD({ ...d, [c.id]: e.target.value })} />
        </Campo>
      ))}
      <div>
        <div className="mb-1 flex items-center gap-3">
          <span className="text-sm font-medium">Fotos gerais do jogo</span>
          <EnviarFoto evento={evento} momento="relatorio" rotulo="📷 Adicionar fotos" desabilitado={finalizado} />
        </div>
        <Galeria evento={evento} fotos={fotos} podeRemover={!finalizado} />
      </div>
      {msg && <Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso>}
      {!finalizado && (
        <div className="space-y-2">
          {!checklistsConcluidos && <Aviso tom="alerta">Para enviar o relatório, conclua antes os check-lists de antes e depois do jogo.</Aviso>}
          <div className="flex flex-wrap gap-2">
            <Botao variante="secundario" disabled={pendente} onClick={() => rodar(() => salvarRelatorio(evento, d, false))}>Salvar rascunho</Botao>
            <Botao disabled={pendente || !d.resumo.trim() || !checklistsConcluidos}
              onClick={() => confirm("Enviar o relatório? Ele vai por e-mail para a operação e os Admins e não poderá mais ser alterado nem reenviado.") && rodar(() => salvarRelatorio(evento, d, true))}>
              Enviar relatório
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
