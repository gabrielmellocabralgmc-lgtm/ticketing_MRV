import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/components/marca";
import { CHAVE_LOGIN, imagensDisponiveis } from "@/lib/imagens";

export const metadata: Metadata = { title: "Confira seu e-mail" };

// Depois de pedir o link de acesso: a pessoa sai do formulário e vê só o que fazer agora.
export default async function LinkEnviado() {
  const foto = (await imagensDisponiveis())[CHAVE_LOGIN];
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-preto px-5 py-12">
      {foto && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/60" />
        </>
      )}
      <div className="relative w-full max-w-[460px] rounded-3xl bg-white p-7 shadow-2xl sm:p-9">
        <div className="flex justify-center"><Marca tamanho="g" /></div>
        <div className="mt-6 flex justify-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-mrv-50">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00843D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
          </span>
        </div>
        <h1 className="mt-4 text-center text-[26px] leading-tight font-bold">Confira o seu e-mail</h1>
        <p className="mt-2 text-center text-base leading-relaxed text-cinza">
          Se o seu e-mail estiver cadastrado, o link de acesso chega em instantes.
        </p>
        <ol className="mt-6 space-y-3 text-[15px] leading-snug">
          <li className="flex gap-3"><Passo n={1} /><span>Abra o e-mail <b>“Seu acesso ao Ingressos MRV”</b>, enviado por naoresponda@ingressos.weareact3.com.</span></li>
          <li className="flex gap-3"><Passo n={2} /><span>Clique em <b>Entrar no sistema</b>. Pronto, você já está dentro.</span></li>
          <li className="flex gap-3"><Passo n={3} /><span>O link vale por <b>20 minutos</b> e funciona uma vez. Pode fechar esta página.</span></li>
        </ol>
        <div className="mt-6 rounded-xl bg-fundo p-4 text-sm leading-snug text-[#434645]">
          Não chegou? Confira a caixa de <b>spam</b> ou lixo eletrônico. Se mesmo assim não aparecer, fale com o Marketing MRV.
        </div>
        <Link href="/login" className="mt-6 block text-center text-sm font-semibold text-mrv-700 hover:underline">Pedir um novo link ou usar outro e-mail</Link>
      </div>
    </main>
  );
}

function Passo({ n }: { n: number }) {
  return <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-mrv-600 text-xs font-bold text-white">{n}</span>;
}
