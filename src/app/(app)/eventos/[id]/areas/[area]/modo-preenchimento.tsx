"use client";
import { useState, type ReactNode } from "react";
import { Aviso, Cartao } from "@/components/ui";

type Modo = "gestor" | "convidado";

/** Escolha de como a área preenche: o gestor digita (já validado) ou manda o link para o convidado. */
export function ModoPreenchimento({ prazo, gestor, convidado }: { prazo: string; gestor: ReactNode; convidado: ReactNode }) {
  const [modo, setModo] = useState<Modo>("gestor");
  const opcoes: { id: Modo; titulo: string; sub: string }[] = [
    { id: "gestor", titulo: "Modo preenchimento pelo gestor", sub: "Você digita os dados de cada convidado" },
    { id: "convidado", titulo: "Modo preenchimento pelo próprio convidado", sub: "Você reserva a vaga e manda o link" },
  ];
  return (
    <Cartao>
      <h2 className="mb-3 font-bold text-mrv-900">Como você quer preencher?</h2>
      <div role="tablist" className="mb-4 grid gap-2 sm:grid-cols-2">
        {opcoes.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={modo === o.id} onClick={() => setModo(o.id)}
            className={`rounded-lg px-4 py-3 text-left ring-1 transition ${modo === o.id ? "bg-mrv-50 ring-2 ring-mrv-700" : "bg-white ring-tinta/15 hover:ring-mrv-700/40"}`}>
            <div className="font-semibold text-mrv-900">{o.titulo}</div>
            <div className="text-xs text-tinta/60">{o.sub}</div>
          </button>
        ))}
      </div>
      <div className="mb-4">
        {modo === "gestor" ? (
          <Aviso tom="info">
            Os dados de todos os convidados são preenchidos por você e <b>validados automaticamente</b> após o preenchimento — não é preciso validar a lista depois.
            Você pode <b>alterar ou cancelar convidados até {prazo}</b> (prazo de solicitação). Depois disso, a lista fica travada.
          </Aviso>
        ) : (
          <Aviso tom="alerta">
            Cada convidado preenche os próprios dados pelo link. Depois, <b>você precisa validar a lista</b> — avisamos por e-mail com a lista e o botão de validação.
            O prazo para validar é o mesmo da solicitação: <b>até {prazo}</b>. Sem validação, o convidado fica como “Preenchido” e não segue para envio.
          </Aviso>
        )}
      </div>
      {modo === "gestor" ? gestor : convidado}
    </Cartao>
  );
}
