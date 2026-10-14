"use client";
import { useActionState } from "react";
import { Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { enviarLink } from "./actions";

export function FormLogin({ next, erroInicial }: { next: string; erroInicial: string | null }) {
  const [estado, acao, pendente] = useActionState(enviarLink, erroInicial ? { ok: false as const, erro: erroInicial } : null);
  return (
    <>
      <form action={acao} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Campo rotulo="E-mail corporativo">
          <Entrada name="email" type="email" required autoComplete="email" placeholder="nome@mrv.com.br" autoFocus />
        </Campo>
        {estado && (estado.ok ? <Aviso tom="ok">{estado.mensagem}</Aviso> : <Aviso tom="erro">{estado.erro}</Aviso>)}
        <Botao type="submit" className="min-h-12 w-full text-base" disabled={pendente}>{pendente ? "Enviando…" : "Receber link de acesso"}</Botao>
      </form>
      <div className="flex items-start gap-3 rounded-xl bg-mrv-50 p-4 text-sm leading-snug text-[#434645]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00843D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px shrink-0"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
        <span>O acesso é liberado pelo Marketing MRV. Não recebeu? Confira o spam ou fale com quem convidou você.</span>
      </div>
    </>
  );
}
