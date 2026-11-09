"use client";
// Conversa de dúvidas (gestor, convidado ou equipe): mensagens em ordem e o campo para escrever.
import { useState, useTransition } from "react";
import clsx from "clsx";
import { AreaTexto, Aviso, Botao } from "@/components/ui";

export interface MensagemConversa { id: number; de: "equipe" | "gestor" | "convidado"; autor_nome: string | null; texto: string; criado_em: string }

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** euSou: de que lado está quem vê (as próprias mensagens ficam à direita). */
export function Conversa({ mensagens, euSou, enviar, rotuloEnviar = "Enviar", placeholder, idCampo }: {
  mensagens: MensagemConversa[]; euSou: "equipe" | "gestor" | "convidado";
  enviar: (texto: string) => Promise<{ ok: boolean; erro?: string; mensagem?: string }>;
  rotuloEnviar?: string; placeholder?: string; idCampo: string;
}) {
  const [texto, setTexto] = useState("");
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const mandar = () => {
    if (!texto.trim()) return;
    iniciar(async () => {
      const r = await enviar(texto);
      setRetorno({ ok: r.ok, msg: (r.ok ? r.mensagem : r.erro) ?? "" });
      if (r.ok) setTexto("");
    });
  };
  return (
    <div className="space-y-3">
      {mensagens.length > 0 && (
        <ol className="space-y-2">
          {mensagens.map((m) => {
            const minha = m.de === euSou || (euSou !== "equipe" && m.de !== "equipe");
            return (
              <li key={m.id} className={clsx("flex", minha ? "justify-end" : "justify-start")}>
                <div className={clsx("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", minha ? "bg-mrv-50 text-tinta" : "bg-white ring-1 ring-borda")}>
                  <div className="mb-0.5 text-xs font-semibold text-cinza">
                    {m.de === "equipe" ? "Equipe de ingressos MRV" : m.autor_nome ?? "—"} · {quando(m.criado_em)}
                  </div>
                  <p className="whitespace-pre-wrap">{m.texto}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <label htmlFor={idCampo} className="sr-only">Mensagem</label>
      <AreaTexto id={idCampo} rows={3} value={texto} maxLength={4000} onChange={(e) => setTexto(e.target.value)} placeholder={placeholder} />
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="button" onClick={mandar} disabled={pendente || !texto.trim()}>{pendente ? "Enviando…" : rotuloEnviar}</Botao>
        {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}
      </div>
    </div>
  );
}
