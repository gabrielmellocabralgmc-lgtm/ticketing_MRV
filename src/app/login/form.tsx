"use client";
import { useActionState, useState } from "react";
import { Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { enviarLink, entrarComSenha } from "./actions";

/**
 * Login: e-mail + senha (o normal). "Primeiro acesso ou esqueci a senha" manda o link por e-mail;
 * quem entra por ele cria (ou troca) a senha em seguida.
 */
export function FormLogin({ next, erroInicial }: { next: string; erroInicial: string | null }) {
  const [modoLink, setModoLink] = useState(!!erroInicial);
  return modoLink
    ? <FormLink next={next} erroInicial={erroInicial} voltar={() => setModoLink(false)} />
    : <FormSenha next={next} pedirLink={() => setModoLink(true)} />;
}

function FormSenha({ next, pedirLink }: { next: string; pedirLink: () => void }) {
  const [estado, acao, pendente] = useActionState(entrarComSenha, null);
  // controlado: errar a senha não apaga o e-mail digitado
  const [email, setEmail] = useState("");
  return (
    <>
      <form action={acao} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Campo rotulo="E-mail"><Entrada id="login-email" name="email" type="email" required autoComplete="username" placeholder="nome@mrv.com.br" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
        <Campo rotulo="Senha"><Entrada id="login-senha" name="senha" type="password" required autoComplete="current-password" /></Campo>
        {estado && !estado.ok && <Aviso tom="erro">{estado.erro}</Aviso>}
        <Botao type="submit" className="min-h-12 w-full text-base" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</Botao>
      </form>
      <button type="button" onClick={pedirLink} className="self-start text-sm font-semibold text-mrv-700 hover:underline">
        Primeiro acesso ou esqueci a senha
      </button>
    </>
  );
}

function FormLink({ next, erroInicial, voltar }: { next: string; erroInicial: string | null; voltar: () => void }) {
  const [estado, acao, pendente] = useActionState(enviarLink, erroInicial ? { ok: false as const, erro: erroInicial } : null);
  return (
    <>
      <div className="rounded-xl bg-mrv-50 p-4 text-sm leading-snug text-[#434645]">
        Enviamos um <b>link de acesso</b> para o seu e-mail. Ao entrar por ele, você cria (ou troca) a sua senha. Depois, é só usar e-mail e senha.
      </div>
      <form action={acao} className="space-y-4">
        {/* depois do link, vai para criar/trocar a senha e então para onde a pessoa ia */}
        <input type="hidden" name="next" value={`/conta/senha?next=${encodeURIComponent(next)}`} />
        <Campo rotulo="E-mail"><Entrada id="link-email" name="email" type="email" required autoComplete="email" placeholder="nome@mrv.com.br" autoFocus /></Campo>
        {estado && (estado.ok ? <Aviso tom="ok">{estado.mensagem}</Aviso> : <Aviso tom="erro">{estado.erro}</Aviso>)}
        <Botao type="submit" className="min-h-12 w-full text-base" disabled={pendente}>{pendente ? "Enviando…" : "Receber link de acesso"}</Botao>
      </form>
      <button type="button" onClick={voltar} className="self-start text-sm font-semibold text-mrv-700 hover:underline">← Entrar com e-mail e senha</button>
    </>
  );
}
