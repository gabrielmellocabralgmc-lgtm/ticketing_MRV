"use client";
import { useState, useTransition } from "react";
import { Aviso, Botao, Selo } from "@/components/ui";
import { dataHora } from "@/lib/formato";
import type { GrupoCamarote } from "@/lib/mensagens/envio";
import { enviarCamarote, enviarListaOperacao } from "./emails-actions";

interface Grupo { id: GrupoCamarote; rotulo: string; quando: string; contatos: number; enviado_em: string | null }

/** Camarote em ondas: VPs primeiro; Diretoria e Gestores só quando o Marketing decidir abrir. */
export function ConvocacaoCamarote({ evento, grupos, operacaoEm }: { evento: string; grupos: Grupo[]; operacaoEm: string | null }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>, confirmar?: string) => {
    if (confirmar && !confirm(confirmar)) return;
    iniciar(async () => { const r = await f(); setMsg({ ok: r.ok, texto: (r.ok ? r.mensagem : r.erro) ?? "" }); });
  };
  return (
    <div className="space-y-3">
      <ol className="divide-y divide-borda rounded-xl ring-1 ring-borda">
        {grupos.map((g, i) => {
          const anteriorEnviado = i === 0 || !!grupos[i - 1].enviado_em;
          return (
            <li key={g.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="font-display text-xl font-bold text-mrv-700">{i + 1}</span>
              <div className="min-w-48 flex-1">
                <div className="font-semibold">{g.rotulo} <span className="font-normal text-cinza">· {g.contatos} contato(s)</span></div>
                <div className="text-xs text-cinza">{g.quando}</div>
              </div>
              {g.enviado_em ? <Selo tom="verde">Enviado {dataHora(g.enviado_em)}</Selo> : !anteriorEnviado && <Selo>Aguardando a onda anterior</Selo>}
              <Botao variante="fantasma" disabled={pendente} onClick={() => rodar(() => enviarCamarote(evento, g.id, true))}>Teste p/ mim</Botao>
              <Botao variante={g.enviado_em ? "secundario" : "primario"} disabled={pendente || !g.contatos}
                onClick={() => rodar(() => enviarCamarote(evento, g.id),
                  `${g.enviado_em ? "Reenviar" : "Enviar"} o e-mail do camarote para ${g.rotulo} (${g.contatos})?${!anteriorEnviado ? " A onda anterior ainda não foi enviada." : ""}`)}>
                {g.enviado_em ? "Reenviar" : i === 0 ? "Enviar" : "Abrir para este grupo"}
              </Botao>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-fundo px-4 py-3">
        <div className="min-w-48 flex-1">
          <div className="font-semibold">Lista para a operação do camarote</div>
          <div className="text-xs text-cinza">Sai sozinha quando as solicitações fecham, com os convidados confirmados. Dá para mandar de novo a qualquer momento.</div>
        </div>
        {operacaoEm && <Selo tom="verde">Enviada {dataHora(operacaoEm)}</Selo>}
        <Botao variante="secundario" disabled={pendente} onClick={() => rodar(() => enviarListaOperacao(evento), "Enviar a lista atual do camarote para a operação?")}>
          {operacaoEm ? "Enviar de novo" : "Enviar agora"}
        </Botao>
      </div>
      {msg && <Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso>}
    </div>
  );
}
