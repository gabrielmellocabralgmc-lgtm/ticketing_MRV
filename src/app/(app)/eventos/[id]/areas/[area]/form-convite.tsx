"use client";
import { useActionState, useEffect, useRef } from "react";
import { BotaoCopiar, BotaoWhatsApp } from "@/components/copiar";
import { Aviso, Botao, Campo, Entrada, Selecao } from "@/components/ui";
import { linkTorcedor, linkWhatsApp, textoConvite } from "@/lib/mensagens";
import type { Setor } from "@/lib/tipos";
import { criarConvite } from "./actions";

export function FormConvite({ evento, setor, area, areaNome, eventoInfo, saldo, maxValidade }: {
  evento: string; setor: Setor; area: string; areaNome: string; saldo: number; maxValidade: string;
  eventoInfo: { titulo: string; inicio: string };
}) {
  const [estado, acao, pendente] = useActionState(criarConvite.bind(null, evento, setor, area), null);
  const ref = useRef<HTMLFormElement>(null);
  const ultimo = useRef<{ nome: string; contato: string; qtd: number }>({ nome: "", contato: "", qtd: 1 });
  useEffect(() => {
    if (estado?.ok) ref.current?.reset();
  }, [estado]);

  return (
    <div className="space-y-4">
      <form
        ref={ref}
        action={acao}
        onSubmit={() => {
          const f = new FormData(ref.current!);
          ultimo.current = { nome: String(f.get("nome_previsto") ?? ""), contato: String(f.get("contato") ?? ""), qtd: Number(f.get("qtd") ?? 1) };
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.2fr_1.4fr_auto] lg:items-end"
      >
        <Campo rotulo="Para quem (referência)"><Entrada name="nome_previsto" required placeholder="João – Comercial" /></Campo>
        <Campo rotulo="Lugares">
          <Selecao name="qtd" defaultValue="2">
            {Array.from({ length: Math.min(10, Math.max(1, saldo)) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Celular (opcional)"><Entrada name="contato" inputMode="tel" placeholder="(31) 9…" /></Campo>
        <Campo rotulo="Validade do link" dica="Em branco: até o prazo de solicitação">
          <Entrada name="expira_em" type="datetime-local" max={maxValidade || undefined} />
        </Campo>
        <Botao type="submit" disabled={pendente || saldo < 1}>{pendente ? "Gerando…" : "Gerar link"}</Botao>
      </form>
      {saldo < 1 && <Aviso tom="alerta">A área está sem saldo. Cancele um pedido ou peça remanejamento ao Marketing.</Aviso>}
      {estado && !estado.ok && <Aviso tom="erro">{estado.erro}</Aviso>}
      {estado?.ok && estado.dados && (
        <Aviso tom="ok">
          <div className="flex flex-wrap items-center gap-2">
            <span>{estado.mensagem}</span>
            <code className="rounded bg-white px-2 py-0.5 text-xs">{linkTorcedor(estado.dados.token)}</code>
            <BotaoCopiar texto={linkTorcedor(estado.dados.token)} rotulo="Copiar link" />
            <BotaoCopiar
              texto={textoConvite({ nome: ultimo.current.nome, evento: eventoInfo, setor, area: areaNome, token: estado.dados.token, qtd: ultimo.current.qtd })}
              rotulo="Copiar mensagem"
            />
            <BotaoWhatsApp
              link={linkWhatsApp(ultimo.current.contato, textoConvite({ nome: ultimo.current.nome, evento: eventoInfo, setor, area: areaNome, token: estado.dados.token, qtd: ultimo.current.qtd }))}
            />
          </div>
        </Aviso>
      )}
    </div>
  );
}
