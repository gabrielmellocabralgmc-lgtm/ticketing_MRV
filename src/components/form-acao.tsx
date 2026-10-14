"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";
import type { Resultado } from "@/lib/erros";
import { Aviso, Botao } from "@/components/ui";

type Acao = (estado: Resultado | null, form: FormData) => Promise<Resultado>;

/** Formulário com server action, mensagem de retorno e reset ao concluir. */
export function FormAcao({
  acao, children, rotulo, rotuloPendente = "Salvando…", className, variante, limparAoConcluir = true, confirmar,
}: {
  acao: Acao;
  children?: ReactNode;
  rotulo: string;
  rotuloPendente?: string;
  className?: string;
  variante?: "primario" | "secundario" | "perigo" | "laranja" | "fantasma";
  limparAoConcluir?: boolean;
  confirmar?: string;
}) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok && limparAoConcluir) ref.current?.reset();
  }, [estado, limparAoConcluir]);
  return (
    <form
      ref={ref}
      action={enviar}
      className={clsx("space-y-3", className)}
      onSubmit={(e) => {
        if (confirmar && !window.confirm(confirmar)) e.preventDefault();
      }}
    >
      {children}
      <Botao type="submit" disabled={pendente} variante={variante}>{pendente ? rotuloPendente : rotulo}</Botao>
      {estado && (estado.ok ? estado.mensagem && <Aviso tom="ok">{estado.mensagem}</Aviso> : <Aviso tom="erro">{estado.erro}</Aviso>)}
    </form>
  );
}

/** Botão único que dispara uma ação sem campos (ex.: mudar status). */
export function BotaoAcao({ acao, rotulo, variante = "secundario", confirmar }: { acao: () => Promise<Resultado>; rotulo: string; variante?: "primario" | "secundario" | "perigo" | "laranja"; confirmar?: string }) {
  return (
    <FormAcao acao={async () => acao()} rotulo={rotulo} variante={variante} confirmar={confirmar} className="space-y-2" />
  );
}
