import type { Metadata } from "next";
import { FormLogin } from "./form";

export const metadata: Metadata = { title: "Entrar" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-mrv-700 text-lg font-black text-white">MRV</div>
          <h1 className="text-xl font-bold text-mrv-900">Ingressos MRV · Arena MRV</h1>
          <p className="mt-1 text-sm text-tinta/60">Enviamos um link de acesso para o seu e-mail. Não há senha.</p>
        </div>
        <FormLogin next={next ?? "/eventos"} erroInicial={erro === "link" ? "O link expirou ou já foi usado. Peça um novo." : null} />
      </div>
    </main>
  );
}
