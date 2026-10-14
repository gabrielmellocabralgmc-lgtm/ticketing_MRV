import { Cartao } from "@/components/ui";
import { sair } from "@/app/(app)/actions";

export default function SemAcesso() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Cartao className="max-w-md text-center">
        <h1 className="text-lg font-bold text-mrv-900">Seu usuário ainda não tem acesso</h1>
        <p className="mt-2 text-sm text-tinta/70">Peça ao Marketing MRV para liberar seu perfil (responsável de área, operação etc.).</p>
        <form action={sair} className="mt-4">
          <button className="text-sm font-semibold text-mrv-700 underline">Sair</button>
        </form>
      </Cartao>
    </main>
  );
}
