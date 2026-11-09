"use client";
import { useActionState, useState } from "react";
import { Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { salvarSenha } from "./actions";

export function FormSenha({ next }: { next: string }) {
  const [estado, acao, pendente] = useActionState(salvarSenha, null);
  const [ver, setVer] = useState(false);
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Campo rotulo="Nova senha" dica="Pelo menos 8 caracteres, com letras e números.">
        <Entrada id="senha-nova" name="senha" type={ver ? "text" : "password"} autoComplete="new-password" required minLength={8} />
      </Campo>
      <Campo rotulo="Repita a senha">
        <Entrada id="senha-confirmar" name="confirmar" type={ver ? "text" : "password"} autoComplete="new-password" required minLength={8} />
      </Campo>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-mrv-700" checked={ver} onChange={(e) => setVer(e.target.checked)} /> Mostrar a senha
      </label>
      {estado && (estado.ok ? <Aviso tom="ok">{estado.mensagem}</Aviso> : <Aviso tom="erro">{estado.erro}</Aviso>)}
      <Botao type="submit" className="min-h-12 w-full text-base" disabled={pendente}>{pendente ? "Salvando…" : "Salvar senha"}</Botao>
    </form>
  );
}
