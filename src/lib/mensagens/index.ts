// Mensagens ao torcedor. Na v1 o canal WhatsApp é "click-to-chat" (wa.me com texto pronto,
// disparado por uma pessoa da equipe). A interface CanalMensagem permite plugar a API oficial
// do WhatsApp Business e o e-mail (Resend) sem mudar quem chama.
import { dataLonga } from "@/lib/formato";
import { ROTULO_SETOR, type Setor } from "@/lib/tipos";

export interface Mensagem {
  para: { nome: string; celular?: string | null; email?: string | null };
  assunto: string;
  texto: string;
  html?: string;
}

export interface CanalMensagem {
  id: "whatsapp_link" | "whatsapp_api" | "email";
  /** Envia (ou, no click-to-chat, devolve o link para a pessoa da equipe abrir). */
  enviar(m: Mensagem): Promise<{ ok: boolean; link?: string; erro?: string }>;
}

export function linkWhatsApp(celular: string | null | undefined, texto: string) {
  let d = (celular ?? "").replace(/\D/g, "");
  if (d && d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

export const whatsappLink: CanalMensagem = {
  id: "whatsapp_link",
  async enviar(m) {
    return { ok: true, link: linkWhatsApp(m.para.celular, m.texto) };
  },
};

export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const linkTorcedor = (token: string) => `${siteUrl()}/i/${token}`;

interface DadosEvento {
  titulo: string;
  inicio: string;
  abertura_portoes?: string | null;
}

export function textoConvite(o: { nome?: string | null; evento: DadosEvento; setor: Setor; area: string; token: string; qtd: number }) {
  return [
    `Olá${o.nome ? `, ${o.nome.split(" ")[0]}` : ""}! A MRV reservou ${o.qtd === 1 ? "um ingresso" : `${o.qtd} ingressos`} para você no ${o.evento.titulo} (${dataLonga(o.evento.inicio)}), ${ROTULO_SETOR[o.setor]}, pela área ${o.area}.`,
    ``,
    `Para garantir, preencha seus dados (nome, CPF e celular) neste link:`,
    linkTorcedor(o.token),
    ``,
    `O pedido só vale depois de preenchido e aprovado pelo Marketing MRV.`,
  ].join("\n");
}

export function textoGaloId(o: { nome: string; evento: DadosEvento; setor: Setor; token: string }) {
  const camarote = o.setor === "camarote";
  return [
    `Olá, ${o.nome.split(" ")[0]}! Seu ingresso MRV para ${o.evento.titulo} (${dataLonga(o.evento.inicio)}) foi aprovado. ✅`,
    ``,
    `Antes de enviarmos o ingresso, faça o cadastro no Galo ID com biometria facial (a entrada na Arena MRV é pela face):`,
    `1. Acesse https://galoid.com.br/ e crie sua conta com o seu CPF`,
    `2. Cadastre a biometria facial`,
    `3. Confirme aqui que já fez: ${linkTorcedor(o.token)}`,
    ``,
    camarote
      ? `Lembrete: o camarote MRV é corporativo. Quem convidou precisa estar presente durante o evento.`
      : `Setor: ${ROTULO_SETOR[o.setor]}.`,
  ].join("\n");
}

export function textoIngressoEnviado(o: { nome: string; evento: DadosEvento; setor: Setor; token: string }) {
  return [
    `${o.nome.split(" ")[0]}, seu ingresso para ${o.evento.titulo} foi enviado pelo sistema do Atlético. 🎟️`,
    ``,
    `Aceite o ingresso no app/site do Galo e confirme aqui: ${linkTorcedor(o.token)}`,
    o.evento.abertura_portoes ? `Portões abrem ${dataLonga(o.evento.abertura_portoes)}.` : ``,
    `Setor: ${ROTULO_SETOR[o.setor]}. Leve um documento com foto.`,
    `Se não puder ir, cancele pelo link para o ingresso ir para outra pessoa.`,
  ].filter(Boolean).join("\n");
}
