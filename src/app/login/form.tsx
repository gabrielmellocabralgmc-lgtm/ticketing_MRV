"use client";
import { useActionState, useState } from "react";
import { Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { enviarLink, entrarComSenha } from "./actions";

export function FormLogin({ next, erroInicial, comSenha }: { next: string; erroInicial: string | null; comSenha: boolean }) {
  const [estado, acao, pendente] = useActionState(enviarLink, erroInicial ? { ok: false as const, erro: erroInicial } : null);
  const [modoSenha, setModoSenha] = useState(false);
  if (modoSenha) return <FormSenha next={next} voltar={() => setModoSenha(false)} />;
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
      {comSenha && (
        <button type="button" onClick={() => setModoSenha(true)} className="self-start text-sm font-semibold text-mrv-700 hover:underline">
          Entrar com senha (Admin)
        </button>
      )}
    </>
  );
}

function FormSenha({ next, voltar }: { next: string; voltar: () => void }) {
  const [estado, acao, pendente] = useActionState(entrarComSenha, null);
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Campo rotulo="E-mail do Admin"><Entrada name="email" type="email" required autoComplete="username" autoFocus /></Campo>
      <Campo rotulo="Senha"><Entrada name="senha" type="password" required autoComplete="current-password" /></Campo>
      {estado && !estado.ok && <Aviso tom="erro">{estado.erro}</Aviso>}
      <Botao type="submit" className="min-h-12 w-full text-base" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</Botao>
      <button type="button" onClick={voltar} className="text-sm font-semibold text-mrv-700 hover:underline">← Receber link por e-mail</button>
    </form>
  );
}
