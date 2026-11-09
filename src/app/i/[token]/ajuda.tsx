"use client";
import { Conversa, type MensagemConversa } from "@/components/conversa";
import { perguntarConvidado } from "./actions";

/** "Precisa de ajuda?" na página do convidado: a conversa com a equipe de ingressos. */
export function AjudaConvidado({ token, mensagens }: { token: string; mensagens: MensagemConversa[] }) {
  return (
    <Conversa mensagens={mensagens} euSou="convidado" idCampo="ajuda-texto" placeholder="Escreva a sua dúvida (ex.: não consegui resgatar o ingresso)"
      rotuloEnviar={mensagens.length ? "Enviar" : "Enviar dúvida"} enviar={(t) => perguntarConvidado(token, t)} />
  );
}
