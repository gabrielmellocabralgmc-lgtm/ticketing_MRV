// Canal de e-mail via Resend (domínio verificado: ingressos.weareact3.com).
// Usado pelas mensagens ao torcedor e convocações (fase 3). O magic link de login sai pelo
// Supabase Auth, configurado com o SMTP do Resend (ver README).
import type { CanalMensagem, Mensagem } from "./index";

export const REMETENTE_PADRAO = "Ingressos MRV <naoresponda@ingressos.weareact3.com>";

function escaparHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** HTML simples com a identidade MRV a partir do texto (links viram clicáveis). */
export function htmlDoTexto(m: Mensagem) {
  const corpo = escaparHtml(m.texto)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#006b3f">$1</a>')
    .replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#2b2b2b">
<div style="background:#006b3f;color:#fff;padding:16px 20px;font-weight:bold;border-bottom:4px solid #ff8b22">Ingressos MRV · Arena MRV</div>
<div style="padding:20px;line-height:1.5">${corpo}</div></div>`;
}

export function canalEmail(opcoes: { apiKey?: string; remetente?: string; responderPara?: string; fetch?: typeof fetch } = {}): CanalMensagem {
  const apiKey = opcoes.apiKey ?? process.env.RESEND_API_KEY;
  const remetente = opcoes.remetente ?? process.env.EMAIL_REMETENTE ?? REMETENTE_PADRAO;
  const responderPara = opcoes.responderPara ?? process.env.EMAIL_RESPONDER_PARA;
  const f = opcoes.fetch ?? fetch;
  return {
    id: "email",
    async enviar(m) {
      if (!apiKey) return { ok: false, erro: "RESEND_API_KEY não configurada" };
      if (!m.para.email) return { ok: false, erro: "Pessoa sem e-mail" };
      const r = await f("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: remetente,
          to: [m.para.email],
          subject: m.assunto,
          text: m.texto,
          html: m.html ?? htmlDoTexto(m),
          ...(responderPara ? { reply_to: responderPara } : {}),
        }),
      });
      if (!r.ok) return { ok: false, erro: `Resend ${r.status}: ${await r.text()}` };
      return { ok: true };
    },
  };
}
