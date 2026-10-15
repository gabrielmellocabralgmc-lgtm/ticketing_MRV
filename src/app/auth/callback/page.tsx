import type { Metadata } from "next";
import { Marca } from "@/components/marca";
import { confirmarLink } from "@/app/login/actions";

export const metadata: Metadata = { title: "Entrar" };

// O link do e-mail abre esta página; o acesso só é liberado no clique. Assim, os antivírus de
// e-mail que "visitam" os links antes da pessoa não queimam o acesso.
export default async function Callback({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-fundo px-6">
      <form action={confirmarLink.bind(null, token)} className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-borda bg-white p-8 text-center">
        <Marca tamanho="g" className="self-center" />
        <h1 className="text-2xl font-bold">Entrar no Ingressos MRV</h1>
        <p className="text-sm text-cinza">Clique para confirmar o acesso neste navegador.</p>
        <button className="min-h-12 rounded-lg bg-mrv-600 px-4 text-base font-bold text-white hover:bg-mrv-700">Entrar</button>
      </form>
    </main>
  );
}
