"use client";
import Link from "next/link";
import { useTransition } from "react";
import { Conversa, type MensagemConversa } from "@/components/conversa";
import { Cartao, Selo } from "@/components/ui";
import { mudarStatusDuvida, responderDuvida } from "./actions";

export interface DuvidaLista {
  id: string; evento_id: string; evento_titulo: string; area_id: string | null; area_nome: string | null;
  autor_tipo: "gestor" | "convidado"; autor_nome: string; autor_email: string | null;
  status: "aguardando" | "respondida" | "resolvida"; atualizado_em: string; mensagens: MensagemConversa[];
}

const SELO = { aguardando: { tom: "amarelo", rotulo: "Aguardando resposta" }, respondida: { tom: "verde", rotulo: "Respondida" }, resolvida: { tom: "cinza", rotulo: "Resolvida" } } as const;

export function ListaDuvidas({ duvidas }: { duvidas: DuvidaLista[] }) {
  const [pendente, iniciar] = useTransition();
  return (
    <ul className="space-y-4">
      {duvidas.map((d) => (
        <li key={d.id} id={d.id} className="scroll-mt-24">
          <Cartao>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold tracking-wide text-mrv-700 uppercase">{d.evento_titulo}{d.area_nome && ` · ${d.area_nome}`}</div>
                <div className="text-lg font-bold">{d.autor_nome}</div>
                <div className="text-sm text-cinza">
                  {d.autor_tipo === "gestor" ? "Gestor da área" : "Convidado"}{d.autor_email && ` · ${d.autor_email}`}
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-xs font-semibold">
                  {d.area_id && <Link className="text-mrv-700 hover:underline" href={`/eventos/${d.evento_id}/areas/${d.area_id}`}>Abrir a lista da área</Link>}
                  <Link className="text-mrv-700 hover:underline" href={`/eventos/${d.evento_id}`}>Abrir o evento</Link>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Selo tom={SELO[d.status].tom}>{SELO[d.status].rotulo}</Selo>
                {d.status !== "resolvida" ? (
                  <button disabled={pendente} onClick={() => iniciar(async () => { await mudarStatusDuvida(d.id, "resolvida"); })} className="text-xs text-cinza hover:underline">Marcar como resolvida</button>
                ) : (
                  <button disabled={pendente} onClick={() => iniciar(async () => { await mudarStatusDuvida(d.id, "respondida"); })} className="text-xs text-cinza hover:underline">Reabrir</button>
                )}
              </div>
            </div>
            <Conversa mensagens={d.mensagens} euSou="equipe" idCampo={`resp-${d.id}`} placeholder="Responder…" rotuloEnviar="Responder"
              enviar={(t) => responderDuvida(d.id, t)} />
          </Cartao>
        </li>
      ))}
    </ul>
  );
}
