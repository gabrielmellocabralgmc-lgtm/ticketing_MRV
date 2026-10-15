"use client";
// Camarote: quem chegou na porta sem estar na lista (registrado pela operação) espera a decisão do Marketing.
import { useState, useTransition } from "react";
import { Aviso, Botao } from "@/components/ui";
import { dataHora } from "@/lib/formato";
import { decidirWalkin } from "./actions";

export interface Walkin {
  id: string;
  nome: string;
  cpf_mascarado: string | null;
  anfitriao: string | null;
  observacao: string | null;
  status: "pendente" | "aprovado" | "recusado";
  criado_em: string;
  registrado_por: string | null;
}

export function PortaCamarote({ evento, walkins }: { evento: string; walkins: Walkin[] }) {
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const pendentes = walkins.filter((w) => w.status === "pendente");
  if (!pendentes.length && !retorno) return null;
  const decidir = (id: string, aprovar: boolean) => iniciar(async () => {
    const r = await decidirWalkin(evento, id, aprovar);
    setRetorno(r.ok ? { ok: true, msg: r.mensagem ?? "Feito." } : { ok: false, msg: r.erro });
  });
  return (
    <div className="space-y-2">
      {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}
      {pendentes.length > 0 && (
        <div className="rounded-2xl border-2 border-amarelo-500 bg-white p-4">
          <h3 className="mb-2 font-bold">Na porta, fora da lista ({pendentes.length})</h3>
          <ul className="divide-y divide-borda">
            {pendentes.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <b>{w.nome}</b> {w.cpf_mascarado && <span className="font-mono text-xs text-cinza">{w.cpf_mascarado}</span>}
                  <div className="text-xs text-cinza">Recebido por {w.anfitriao ?? "?"} · {w.observacao ?? "sem observação"} · registrado por {w.registrado_por ?? "operação"} às {dataHora(w.criado_em)}</div>
                </div>
                <Botao disabled={pendente} onClick={() => decidir(w.id, true)}>Liberar entrada</Botao>
                <Botao variante="perigo" disabled={pendente} onClick={() => decidir(w.id, false)}>Recusar</Botao>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
