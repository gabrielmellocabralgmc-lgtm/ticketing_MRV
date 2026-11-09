import Link from "next/link";
import { Aviso, Cartao, Titulo } from "@/components/ui";
import { MODO_DEMO } from "@/lib/demo/constantes";
import { exigirSessao } from "@/lib/sessao";
import { FormSenha } from "./form";

export const metadata = { title: "Minha senha" };

// Criar a senha (primeiro acesso, depois do link do e-mail) ou trocar (inclusive pelo "Esqueci a senha").
export default async function MinhaSenha({ searchParams }: { searchParams: Promise<{ primeiro?: string; next?: string }> }) {
  const s = await exigirSessao();
  const { primeiro: primeiroParam, next } = await searchParams;
  // sem senha ainda (primeiro acesso, inclusive vindo do "Primeiro acesso ou esqueci a senha")
  const primeiro = primeiroParam || (!MODO_DEMO && !(await (await import("@/lib/auth/senha")).temSenha(s.userId)));
  const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : "";
  return (
    <div className="mx-auto max-w-md">
      <Titulo sub={primeiro ? "É o seu primeiro acesso. Crie uma senha para entrar depois de qualquer aparelho, sem precisar de link no e-mail." : `Entrar com ${s.email} e a sua senha, em qualquer aparelho.`}>
        {primeiro ? "Crie a sua senha" : "Minha senha"}
      </Titulo>
      <Cartao>
        {MODO_DEMO ? <Aviso tom="info">No modo demonstração não há senha.</Aviso> : <FormSenha next={destino || (primeiro ? "/eventos" : "")} />}
      </Cartao>
      {primeiro && (
        <p className="mt-4 text-center text-sm">
          <Link href={destino || "/eventos"} className="text-cinza hover:underline">Agora não</Link>
          <span className="text-cinza"> · dá para criar depois em “Minha senha”, no topo da tela</span>
        </p>
      )}
    </div>
  );
}
