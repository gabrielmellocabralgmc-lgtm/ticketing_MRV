"use client";
import { useState, useTransition } from "react";
import { Aviso, Botao } from "@/components/ui";
import { acaoTorcedor } from "./actions";

export function BotoesTorcedor({ token, status }: { token: string; status: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (acao: "facial_ok" | "recebido" | "cancelar") =>
    iniciar(async () => {
      const r = await acaoTorcedor(token, acao);
      setErro(r.ok ? null : r.erro);
    });
  const podeCancelar = !["presente", "cancelado", "recusado", "no_show", "convite_expirado"].includes(status);
  return (
    <div className="space-y-3">
      {(status === "aprovado" || status === "facial_pendente") && (
        <Botao className="w-full" disabled={pendente} onClick={() => rodar("facial_ok")}>Já fiz minha facial no Galo ID</Botao>
      )}
      {status === "enviado" && (
        <Botao className="w-full" disabled={pendente} onClick={() => rodar("recebido")}>Recebi meu ingresso</Botao>
      )}
      {podeCancelar && (
        <button
          className="w-full text-center text-sm text-tinta/60 underline hover:text-red-700"
          disabled={pendente}
          onClick={() => confirm("Não vai poder ir? O ingresso volta para a MRV e vai para outra pessoa.") && rodar("cancelar")}
        >
          Não vou poder ir — cancelar meu ingresso
        </button>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}
