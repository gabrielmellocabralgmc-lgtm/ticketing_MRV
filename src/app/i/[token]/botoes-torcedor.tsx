"use client";
import { useState, useTransition } from "react";
import { Aviso, Botao } from "@/components/ui";
import { acaoTorcedor } from "./actions";

/** resgate: evento com link de resgate único (o "recebi" fica no bloco do resgate). O convidado não cancela pelo link. */
export function BotoesTorcedor({ token, status, resgate = false }: { token: string; status: string; resgate?: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (acao: "facial_ok" | "recebido") =>
    iniciar(async () => {
      const r = await acaoTorcedor(token, acao);
      setErro(r.ok ? null : r.erro);
    });
  return (
    <div className="space-y-3">
      {(status === "aprovado" || status === "facial_pendente") && (
        <Botao className="min-h-14 w-full text-base font-extrabold tracking-wide uppercase" disabled={pendente} onClick={() => rodar("facial_ok")}>
          ✓ Já tenho a facial cadastrada
        </Botao>
      )}
      {status === "enviado" && !resgate && (
        <Botao className="w-full" disabled={pendente} onClick={() => rodar("recebido")}>Recebi meu ingresso</Botao>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}
