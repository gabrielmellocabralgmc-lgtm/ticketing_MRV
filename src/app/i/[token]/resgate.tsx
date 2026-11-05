"use client";
import { useState, useTransition } from "react";
import { Aviso, Botao } from "@/components/ui";
import { acaoTorcedor, resgatarIngresso } from "./actions";

const APP_STORE = "https://apps.apple.com/br/app/eventim-br/id1187371599";
const GOOGLE_PLAY = "https://play.google.com/store/search?q=eventim%20brasil&c=apps";

const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/**
 * Passo a passo + resgate do link único. O link só sai do servidor depois das confirmações,
 * e o banco aceita no máximo uma abertura (com 30 min de tolerância para tentar de novo).
 */
export function ResgateIngresso({ token, nome, status, abertoEm, expiraEm, travado }: {
  token: string; nome: string; status: string;
  abertoEm: string | null; expiraEm: string | null; travado: boolean;
}) {
  const [marcados, setMarcados] = useState<boolean[]>([false, false, false]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const confirmado = status === "confirmado" || status === "presente";
  const tudo = marcados.every(Boolean);

  const resgatar = () => {
    if (!confirm("ATENÇÃO: o link é ÚNICO e só funciona UMA VEZ.\n\nDepois de aceito, o ingresso fica na conta Eventim aberta neste celular e não pode ser passado para outra pessoa.\n\nVocê está no celular certo, logado na SUA conta Eventim?")) return;
    iniciar(async () => {
      const r = await resgatarIngresso(token);
      if (!r.ok) { setErro(r.erro); return; }
      setErro(null);
      if (r.dados) window.location.href = r.dados;
    });
  };
  const apareceu = () => iniciar(async () => {
    const r = await acaoTorcedor(token, "recebido");
    setErro(r.ok ? null : r.erro);
  });

  if (confirmado) {
    return (
      <div className="space-y-3">
        <Aviso tom="ok">✓ Ingresso resgatado. Ele está no seu app EVENTIM BRASIL, em “Meus ingressos”.</Aviso>
        <p className="text-sm text-tinta/70">O QR code é dinâmico e aparece no app perto do evento (até 24h antes). Print ou foto da tela não valem: leve o celular com o app e um documento com foto.</p>
      </div>
    );
  }

  if (travado) {
    return (
      <Aviso tom="alerta">
        Este ingresso já foi resgatado{abertoEm ? ` em ${hora(abertoEm)}` : ""}. Abra o app EVENTIM BRASIL e confira em “Meus ingressos”.
        Se ele não estiver lá, fale com o Marketing MRV ou com quem convidou você.
      </Aviso>
    );
  }

  const itens = [
    `Sou eu, ${nome}, quem vai ao evento.`,
    "Já baixei o app EVENTIM BRASIL e entrei com a MINHA conta (com o meu CPF).",
    "Estou no celular que vou levar ao evento.",
  ];

  return (
    <div className="space-y-4">
      <Aviso tom="alerta">
        <b>Seu ingresso é um link único da Eventim.</b> Ele só funciona <b>uma vez</b> e precisa ser resgatado por <b>você</b>, que vai ao evento. Faça os passos abaixo <b>antes</b> de tocar no botão.
      </Aviso>

      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          No celular que você vai levar ao evento, baixe o app <b>EVENTIM BRASIL</b>:{" "}
          <a className="font-semibold text-mrv-700 underline" href={APP_STORE} target="_blank" rel="noopener noreferrer">iPhone (App Store)</a>{" · "}
          <a className="font-semibold text-mrv-700 underline" href={GOOGLE_PLAY} target="_blank" rel="noopener noreferrer">Android (Google Play)</a>.
        </li>
        <li>Crie a sua conta com os <b>seus</b> dados (nome, CPF e e-mail). Se já tiver conta Eventim, use a sua.</li>
        <li><b>Entre (faça login)</b> no app.</li>
        <li>Volte a esta página <b>no mesmo celular</b>, marque as confirmações e toque em <b>“Resgatar meu ingresso”</b>.</li>
        <li>O app da Eventim abre: <b>aceite o ingresso</b>. Confira em <b>“Meus ingressos”</b> e volte aqui para tocar em <b>“O ingresso apareceu no meu app”</b>.</li>
      </ol>

      {abertoEm && expiraEm && (
        <Aviso tom="info">
          Você abriu o link em {hora(abertoEm)}. Se algo deu errado (por exemplo, não estava logado no app), ainda dá para tentar de novo até {hora(expiraEm)}. Depois disso o link trava.
        </Aviso>
      )}

      <fieldset className="space-y-2 rounded-lg bg-black/[0.03] p-3">
        <legend className="sr-only">Confirmações antes do resgate</legend>
        {itens.map((t, i) => (
          <label key={t} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-mrv-700" checked={marcados[i]}
              onChange={(e) => setMarcados((m) => m.map((v, j) => (j === i ? e.target.checked : v)))} />
            <span>{t}</span>
          </label>
        ))}
      </fieldset>

      <Botao className="min-h-14 w-full text-base font-extrabold tracking-wide uppercase" disabled={!tudo || pendente} onClick={resgatar}>
        {pendente ? "Abrindo…" : abertoEm ? "Tentar o resgate de novo" : "🎟 Resgatar meu ingresso"}
      </Botao>
      {!tudo && <p className="text-center text-xs text-tinta/60">Marque as três confirmações para liberar o botão.</p>}

      {abertoEm && (
        <Botao variante="secundario" className="w-full" disabled={pendente} onClick={apareceu}>✓ O ingresso apareceu no meu app</Botao>
      )}
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </div>
  );
}
