import type { Metadata } from "next";
import clsx from "clsx";
import { BotaoCopiar } from "@/components/copiar";
import { Aviso, Cartao, SeloStatus } from "@/components/ui";
import { dataHora, dataLonga } from "@/lib/formato";
import { linkTorcedor } from "@/lib/mensagens";
import { supabaseServico } from "@/lib/supabase/server";
import { ROTULO_SETOR, type Setor, type StatusIngresso } from "@/lib/tipos";
import { BotoesTorcedor } from "./botoes-torcedor";
import { FormConvidado } from "./form-convidado";

export const metadata: Metadata = { title: "Seu ingresso MRV", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

interface EventoPublico { titulo: string; inicio: string; abertura_portoes: string | null; competicao: string | null; tipo: string }
interface InfoConvite {
  tipo: "convite"; status: string; qtd_lugares: number; nome_previsto: string | null; expira_em: string;
  setor: Setor; area: string; evento: EventoPublico; ingressos: { token: string; nome: string; status: StatusIngresso }[];
}
interface InfoIngresso {
  tipo: "ingresso"; status: StatusIngresso; setor: Setor; area: string; evento: EventoPublico;
  pessoa: { nome: string; cpf: string } | null; convidado_de: string | null;
  facial_em: string | null; enviado_em: string | null; recebido_em: string | null;
}

async function consultar(token: string) {
  if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return null;
  const { data } = await (await supabaseServico()).rpc("consultar_link", { p_token: token });
  return data as InfoConvite | InfoIngresso | null;
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="bg-mrv-700 px-4 py-4 text-white">
        <div className="mx-auto flex max-w-lg items-center gap-2 font-bold">
          <span className="rounded-md bg-white px-1.5 py-0.5 text-xs font-black text-mrv-700">MRV</span> Arena MRV
        </div>
      </header>
      <div className="h-1 bg-laranja-500" />
      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">{children}</main>
    </div>
  );
}

function CabecalhoEvento({ evento, setor, area }: { evento: EventoPublico; setor: Setor; area: string }) {
  return (
    <Cartao>
      <div className="text-xs font-semibold tracking-wide text-laranja-500 uppercase">{evento.competicao ?? (evento.tipo === "jogo" ? "Jogo" : "Show")}</div>
      <h1 className="mt-0.5 text-2xl font-bold text-mrv-900">{evento.titulo}</h1>
      <p className="text-sm text-tinta/70 first-letter:uppercase">{dataLonga(evento.inicio)}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-xs text-tinta/50">Setor</dt><dd className="font-medium">{ROTULO_SETOR[setor]}</dd></div>
        <div><dt className="text-xs text-tinta/50">Convite da área</dt><dd className="font-medium">{area}</dd></div>
        {evento.abertura_portoes && <div><dt className="text-xs text-tinta/50">Portões</dt><dd className="font-medium">{dataHora(evento.abertura_portoes)}</dd></div>}
      </dl>
    </Cartao>
  );
}

const ETAPAS: { rotulo: string; feitos: StatusIngresso[] }[] = [
  { rotulo: "Pedido registrado", feitos: ["solicitado", "validado_area", "aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado", "presente"] },
  { rotulo: "Aprovado pela MRV", feitos: ["aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado", "presente"] },
  { rotulo: "Facial no Galo ID", feitos: ["facial_ok", "enviado", "confirmado", "presente"] },
  { rotulo: "Ingresso enviado", feitos: ["enviado", "confirmado", "presente"] },
  { rotulo: "Ingresso recebido", feitos: ["confirmado", "presente"] },
];

async function PaginaIngresso({ token, info, acompanhantes }: { token: string; info: InfoIngresso; acompanhantes?: { token: string; nome: string }[] }) {
  const encerrado = ["cancelado", "recusado", "no_show", "convite_expirado"].includes(info.status);
  const camarote = info.setor === "camarote";
  return (
    <>
      <CabecalhoEvento evento={info.evento} setor={info.setor} area={info.area} />
      <Cartao>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-tinta/60">Ingresso de</p>
            <p className="text-lg font-bold">{info.pessoa?.nome}</p>
            <p className="font-mono text-xs text-tinta/60">CPF {info.pessoa?.cpf}{info.convidado_de && ` · convidado de ${info.convidado_de}`}</p>
          </div>
          <SeloStatus status={info.status} />
        </div>
        {!encerrado && (
          <ol className="mt-5 space-y-2">
            {ETAPAS.map((e) => {
              const ok = e.feitos.includes(info.status);
              return (
                <li key={e.rotulo} className="flex items-center gap-3 text-sm">
                  <span className={clsx("flex size-6 items-center justify-center rounded-full text-xs font-bold", ok ? "bg-mrv-700 text-white" : "bg-black/5 text-tinta/40")}>{ok ? "✓" : "·"}</span>
                  <span className={ok ? "font-medium" : "text-tinta/50"}>{e.rotulo}</span>
                </li>
              );
            })}
          </ol>
        )}
        {(info.status === "solicitado" || info.status === "validado_area") && (
          <div className="mt-4"><Aviso tom="info">Recebemos seus dados. O pedido ainda vai ser aprovado pela MRV; avisaremos pelo WhatsApp. Enquanto isso, já pode fazer o cadastro no Galo ID (abaixo).</Aviso></div>
        )}
        {info.status === "lista_espera" && <div className="mt-4"><Aviso tom="alerta">Você está na lista de espera. Se abrir vaga, avisamos.</Aviso></div>}
        {info.status === "cancelado" && <div className="mt-4"><Aviso tom="info">Este ingresso foi cancelado.</Aviso></div>}
        {info.status === "recusado" && <div className="mt-4"><Aviso tom="info">Este pedido não pôde ser atendido desta vez.</Aviso></div>}
      </Cartao>

      {!encerrado && info.status !== "presente" && (
        <Cartao>
          <h2 className="mb-3 font-bold text-mrv-900">Passo a passo</h2>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li><b>Crie sua conta no Galo ID</b> com o seu CPF em <a className="font-semibold text-mrv-700 underline" href="https://galoid.com.br/" target="_blank" rel="noopener noreferrer">galoid.com.br</a>.</li>
            <li><b>Cadastre a biometria facial.</b> A entrada na Arena MRV é feita pelo reconhecimento facial.</li>
            <li><b>Volte aqui e toque em “Já fiz minha facial”.</b> Só enviamos o ingresso depois disso.</li>
            <li><b>Aceite o ingresso</b> quando ele chegar pelo sistema do Atlético e toque em “Recebi meu ingresso”.</li>
            <li><b>No dia:</b> chegue com antecedência{info.evento.abertura_portoes ? ` (portões às ${dataHora(info.evento.abertura_portoes).split(" ")[1]})` : ""}, leve um documento com foto e vá ao setor {ROTULO_SETOR[info.setor]}.</li>
          </ol>
          {camarote && (
            <div className="mt-4"><Aviso tom="alerta">O camarote MRV é corporativo: quem convidou você precisa estar presente durante o evento. O ingresso não pode ser repassado.</Aviso></div>
          )}
          <div className="mt-5"><BotoesTorcedor token={token} status={info.status} /></div>
        </Cartao>
      )}

      {acompanhantes && acompanhantes.length > 0 && (
        <Cartao>
          <h2 className="mb-1 font-bold text-mrv-900">Seus acompanhantes</h2>
          <p className="mb-3 text-sm text-tinta/60">Cada um tem o próprio link para acompanhar o ingresso e confirmar a facial. Mande para eles:</p>
          <ul className="space-y-2">
            {acompanhantes.map((a) => (
              <li key={a.token} className="flex items-center justify-between gap-2 text-sm">
                <span>{a.nome}</span>
                <BotaoCopiar texto={linkTorcedor(a.token)} rotulo="Copiar link" />
              </li>
            ))}
          </ul>
        </Cartao>
      )}
      <p className="text-center text-xs text-tinta/50">Dúvidas? Fale com quem enviou o convite ou com o Marketing MRV.</p>
    </>
  );
}

export default async function PaginaPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await consultar(token);

  if (!info) {
    return <Moldura><Cartao><h1 className="font-bold text-mrv-900">Link inválido</h1><p className="mt-1 text-sm text-tinta/70">Confira se o link foi copiado inteiro ou peça um novo a quem convidou você.</p></Cartao></Moldura>;
  }

  if (info.tipo === "ingresso") {
    return <Moldura><PaginaIngresso token={token} info={info} /></Moldura>;
  }

  // Convite já preenchido: vira a página do ingresso do titular
  if (info.status === "preenchido" && info.ingressos.length) {
    const titular = await consultar(info.ingressos[0].token);
    if (titular?.tipo === "ingresso") {
      return <Moldura><PaginaIngresso token={info.ingressos[0].token} info={titular} acompanhantes={info.ingressos.slice(1)} /></Moldura>;
    }
  }

  if (info.status !== "aguardando") {
    return (
      <Moldura>
        <CabecalhoEvento evento={info.evento} setor={info.setor} area={info.area} />
        <Cartao>
          <h1 className="font-bold text-mrv-900">{info.status === "expirado" ? "Este convite expirou" : "Este convite não está mais disponível"}</h1>
          <p className="mt-1 text-sm text-tinta/70">Se ainda quiser ir, fale com quem enviou o convite.</p>
        </Cartao>
      </Moldura>
    );
  }

  const { data: priv } = await (await supabaseServico()).from("config").select("valor").eq("chave", "privacidade").maybeSingle();
  return (
    <Moldura>
      <CabecalhoEvento evento={info.evento} setor={info.setor} area={info.area} />
      <Cartao>
        <h2 className="font-bold text-mrv-900">Preencha para garantir {info.qtd_lugares > 1 ? `até ${info.qtd_lugares} ingressos` : "seu ingresso"}</h2>
        <p className="mt-1 mb-4 text-sm text-tinta/70">
          Válido até {dataHora(info.expira_em)}. Depois de enviar, o pedido passa pela validação da área e pela aprovação da MRV.
          {info.setor === "camarote" && " Camarote: quem convidou precisa estar presente; o ingresso não pode ser repassado."}
        </p>
        <FormConvidado token={token} lugares={info.qtd_lugares} privacidade={String(priv?.valor ?? "")} />
      </Cartao>
    </Moldura>
  );
}
