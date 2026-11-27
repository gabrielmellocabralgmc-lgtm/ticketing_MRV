"use client";
import { useState } from "react";
import { Conversa, type MensagemConversa } from "@/components/conversa";
import { Cartao, Selo } from "@/components/ui";
import { mensagemEquipeParaArea, perguntarArea, responderComoEquipe, responderNaArea } from "./actions";

interface DuvidaArea { id: string; status: "aguardando" | "respondida" | "resolvida"; autor_tipo: "gestor" | "convidado" | "equipe"; autor_nome: string; mensagens: MensagemConversa[] }

const SELO = { aguardando: { tom: "amarelo", rotulo: "Aguardando resposta" }, respondida: { tom: "verde", rotulo: "Respondida" }, resolvida: { tom: "cinza", rotulo: "Resolvida" } } as const;

/** Situação vista por quem está na tela (gestor ou equipe). */
function selo(d: DuvidaArea, equipe: boolean): { tom: "amarelo" | "verde" | "cinza" | "azul"; rotulo: string } {
  if (d.status === "resolvida") return SELO.resolvida;
  const ultima = d.mensagens[d.mensagens.length - 1];
  if (ultima?.de === "equipe") return equipe ? { tom: "azul", rotulo: "Aguardando a área" } : { tom: "verde", rotulo: d.autor_tipo === "equipe" ? "Mensagem da equipe" : "Respondida" };
  return equipe ? { tom: "amarelo", rotulo: "Aguardando a equipe" } : SELO.aguardando;
}

/**
 * Conversas da área com a equipe de ingressos (o contexto — evento e área — já vai junto).
 * Gestor: tira dúvidas. Equipe (Admin): escreve para a área toda — todos os responsáveis recebem por e-mail.
 */
export function DuvidasArea({ evento, area, duvidas, equipe = false, responsaveis = [] }: {
  evento: string; area: string; duvidas: DuvidaArea[];
  /** Admin vendo a lista da área: escreve como equipe de ingressos. */
  equipe?: boolean;
  /** Quem recebe as mensagens da equipe (nomes), para mostrar na tela do Admin. */
  responsaveis?: string[];
}) {
  const [nova, setNova] = useState(duvidas.length === 0);
  const eu = equipe ? "equipe" : "gestor";
  return (
    <Cartao id="duvidas" className="mt-6 scroll-mt-24">
      {equipe ? (
        <>
          <h2 className="font-bold text-mrv-900">Mensagens para a área</h2>
          <p className="mb-4 text-sm text-tinta/70">
            Escreva para os responsáveis desta área. Todos recebem um e-mail e respondem por aqui, na lista da área; as respostas também chegam em Dúvidas.
            <span className="mt-1 block text-xs text-cinza">
              {responsaveis.length ? <>Vai para: <b className="font-semibold text-tinta">{responsaveis.join(", ")}</b></> : "Esta área ainda não tem responsável cadastrado."}
            </span>
          </p>
        </>
      ) : (
        <>
          <h2 className="font-bold text-mrv-900">Dúvidas? Fale com a equipe de ingressos</h2>
          <p className="mb-4 text-sm text-tinta/70">Escreva aqui. A equipe já recebe o evento e a sua área junto com a mensagem, e você é avisado por e-mail quando houver resposta.</p>
        </>
      )}
      {duvidas.length > 0 && (
        <ul className="mb-5 space-y-4">
          {duvidas.map((d) => {
            const st = selo(d, equipe);
            return (
              <li key={d.id} className="rounded-xl bg-fundo p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-cinza">{d.autor_tipo === "equipe" ? "Aberta pela equipe de ingressos" : `Aberta por ${d.autor_nome}`}</span>
                  <Selo tom={st.tom}>{st.rotulo}</Selo>
                </div>
                <Conversa mensagens={d.mensagens} euSou={eu} idCampo={`resp-${d.id}`} placeholder="Responder nesta conversa…"
                  rotuloEnviar="Responder" enviar={(t) => (equipe ? responderComoEquipe(evento, area, d.id, t) : responderNaArea(evento, area, d.id, t))} />
              </li>
            );
          })}
        </ul>
      )}
      {nova ? (
        <Conversa mensagens={[]} euSou={eu} idCampo="nova-duvida" placeholder={equipe ? "Mensagem para os responsáveis da área…" : "Qual é a sua dúvida?"}
          rotuloEnviar={equipe ? "Enviar para a área" : "Enviar dúvida"}
          enviar={(t) => (equipe ? mensagemEquipeParaArea(evento, area, t) : perguntarArea(evento, area, t))} />
      ) : (
        <button type="button" onClick={() => setNova(true)} className="text-sm font-semibold text-mrv-700 hover:underline">
          {equipe ? "+ Nova mensagem para a área" : "+ Nova dúvida"}
        </button>
      )}
    </Cartao>
  );
}
