import type { Metadata } from "next";
import { Listras } from "@/components/jogo";
import { Marca } from "@/components/marca";
import { MODO_DEMO } from "@/lib/demo/constantes";
import { CHAVE_LOGIN, imagensDisponiveis } from "@/lib/imagens";
import { LoginDemo } from "./demo";
import { FormLogin } from "./form";

export const metadata: Metadata = { title: "Entrar" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  const foto = (await imagensDisponiveis())[CHAVE_LOGIN];
  return (
    <main className="flex min-h-dvh flex-wrap bg-white">
      {/* lado da foto (enviada em Aparência); sem foto, fica o fundo preto do Galo */}
      <div className="relative flex min-h-[320px] flex-[1_1_560px] flex-col justify-between overflow-hidden bg-preto p-8 sm:p-12">
        {foto && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-black/55" />
          </>
        )}
        <div className="relative flex items-center gap-3">
          <Marca claro />
          <span className="h-6 w-px bg-white/40" />
          <span className="font-display text-sm font-bold tracking-[0.06em] text-white">ARENA MRV</span>
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-4xl leading-[1.05] font-extrabold text-white uppercase sm:text-[44px]">Todo ingresso tem um papel</p>
          <p className="mt-3 text-[17px] leading-relaxed text-white/85">Aproximar pessoas da MRV — no camarote, na arquibancada e na pista.</p>
          <Listras className="mt-6 w-48" />
        </div>
      </div>

      <div className="flex flex-[1_1_480px] items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-[400px] flex-col gap-7">
          <div className="flex flex-col gap-2">
            <div className="font-display text-[13px] font-bold tracking-[0.08em] text-mrv-600">INGRESSOS MRV</div>
            <h1 className="text-[32px] leading-tight font-bold">Entrar no sistema</h1>
            {!MODO_DEMO && <p className="text-base leading-relaxed text-cinza">Enviamos um link de acesso para o seu e-mail. Não há senha.</p>}
          </div>
          {MODO_DEMO ? (
            <LoginDemo next={next ?? "/eventos"} />
          ) : (
            <FormLogin next={next ?? "/eventos"} erroInicial={erro === "link" ? "O link expirou ou já foi usado. Peça um novo." : null} />
          )}
          <p className="text-[13px] text-cinza">MRV&amp;CO · Patrocinadora da Arena MRV</p>
        </div>
      </div>
    </main>
  );
}
