"use client";
import { useActionState } from "react";
import { Aviso, Botao, Campo, Cartao, Entrada } from "@/components/ui";
import { enviarLink } from "./actions";

export function FormLogin({ next, erroInicial }: { next: string; erroInicial: string | null }) {
  const [estado, acao, pendente] = useActionState(enviarLink, erroInicial ? { ok: false as const, erro: erroInicial } : null);
  return (
    <Cartao>
      <form action={acao} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Campo rotulo="E-mail corporativo">
          <Entrada name="email" type="email" required autoComplete="email" placeholder="nome@mrv.com.br" autoFocus />
        </Campo>
        {estado && (estado.ok ? <Aviso tom="ok">{estado.mensagem}</Aviso> : <Aviso tom="erro">{estado.erro}</Aviso>)}
        <Botao type="submit" className="w-full" disabled={pendente}>{pendente ? "Enviando…" : "Receber link de acesso"}</Botao>
      </form>
    </Cartao>
  );
}
