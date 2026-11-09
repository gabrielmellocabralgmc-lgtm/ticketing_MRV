"use client";
import { useState } from "react";
import { Conversa, type MensagemConversa } from "@/components/conversa";
import { Cartao, Selo } from "@/components/ui";
import { perguntarArea, responderNaArea } from "./actions";

interface DuvidaArea { id: string; status: "aguardando" | "respondida" | "resolvida"; autor_nome: string; mensagens: MensagemConversa[] }

const SELO = { aguardando: { tom: "amarelo", rotulo: "Aguardando resposta" }, respondida: { tom: "verde", rotulo: "Respondida" }, resolvida: { tom: "cinza", rotulo: "Resolvida" } } as const;

/** Dúvidas da área com a equipe de ingressos: o contexto (evento, área, quem) já vai junto. */
export function DuvidasArea({ evento, area, duvidas }: { evento: string; area: string; duvidas: DuvidaArea[] }) {
  const [nova, setNova] = useState(duvidas.length === 0);
  return (
    <Cartao id="duvidas" className="mt-6 scroll-mt-24">
      <h2 className="font-bold text-mrv-900">Dúvidas? Fale com a equipe de ingressos</h2>
      <p className="mb-4 text-sm text-tinta/70">Escreva aqui. A equipe já recebe o evento e a sua área junto com a mensagem, e você é avisado por e-mail quando houver resposta.</p>
      {duvidas.length > 0 && (
        <ul className="mb-5 space-y-4">
          {duvidas.map((d) => (
            <li key={d.id} className="rounded-xl bg-fundo p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-cinza">Aberta por {d.autor_nome}</span>
                <Selo tom={SELO[d.status].tom}>{SELO[d.status].rotulo}</Selo>
              </div>
              <Conversa mensagens={d.mensagens} euSou="gestor" idCampo={`resp-${d.id}`} placeholder="Responder nesta conversa…"
                rotuloEnviar="Responder" enviar={(t) => responderNaArea(evento, area, d.id, t)} />
            </li>
          ))}
        </ul>
      )}
      {nova ? (
        <Conversa mensagens={[]} euSou="gestor" idCampo="nova-duvida" placeholder="Qual é a sua dúvida?"
          rotuloEnviar="Enviar dúvida" enviar={(t) => perguntarArea(evento, area, t)} />
      ) : (
        <button type="button" onClick={() => setNova(true)} className="text-sm font-semibold text-mrv-700 hover:underline">+ Nova dúvida</button>
      )}
    </Cartao>
  );
}
