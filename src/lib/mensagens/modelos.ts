// Modelos de e-mail: troca de {{variaveis}} e HTML com a identidade MRV + Galo ID.
// Sem dependências de servidor (usado também na prévia do editor).

export const VARIAVEIS: Record<string, string> = {
  jogo: "Nome da partida (Galo × Coritiba)",
  data: "Data e hora do jogo",
  portoes: "Abertura dos portões",
  prazo: "Prazo para as áreas solicitarem",
  prazo_validacao: "Prazo para validar a lista",
  area: "Nome da área",
  responsavel: "Primeiro nome do responsável",
  cota: "Cota da área (ex.: 10)",
  saldo: "Saldo ainda não usado pela área",
  pendentes: "Pedidos aguardando validação",
  setor: "Setor (Arquibancada, Pista, Camarote)",
  nome: "Primeiro nome do convidado",
  lugares: "Quantidade de lugares do convite",
  validade: "Validade do link de convite",
  link: "Link da área ou da página do convidado",
};

/** Exemplo usado na prévia do editor. */
export const EXEMPLO: Record<string, string> = {
  jogo: "Galo × Coritiba", data: "sábado, 17 de outubro às 19:00", portoes: "17:00",
  prazo: "sexta, 16/10 às 12:00", prazo_validacao: "sexta, 16/10 às 18:00", area: "DH", responsavel: "Ana",
  cota: "10", saldo: "4", pendentes: "2", setor: "Arquibancada (Inter Oeste)", nome: "João", lugares: "2 lugares",
  validade: "16/10 às 12:00", link: "https://ingressos.weareact3.com/…",
};

export function preencher(texto: string, vars: Record<string, string | number | null | undefined>) {
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    return v === null || v === undefined || v === "" ? "—" : String(v);
  });
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texto simples → HTML de e-mail (tabelas e estilos inline, para funcionar nos clientes de e-mail). */
export function htmlEmail(texto: string, opcoes: { logoUrl?: string; botao?: { rotulo: string; url: string } } = {}) {
  const corpo = escapar(texto)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#00843D;font-weight:600">$1</a>')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const logo = opcoes.logoUrl
    ? `<img src="${escapar(opcoes.logoUrl)}" alt="MRV" height="32" style="height:32px;display:block">`
    : `<span style="background:#00843D;color:#fff;font-weight:800;font-size:15px;padding:4px 8px;border-radius:6px;font-family:Arial,sans-serif">MRV</span>`;
  const listras = Array.from({ length: 12 }, (_, i) => `<td style="height:6px;background:${i % 2 ? "#121212" : "#ffffff"}"></td>`).join("");
  const botao = opcoes.botao
    ? `<p style="margin:22px 0 6px"><a href="${escapar(opcoes.botao.url)}" style="display:inline-block;background:#00843D;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px">${escapar(opcoes.botao.rotulo)}</a></p>`
    : "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F4F5F4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E5E5E5;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#242625">
<tr><td style="padding:18px 24px;background:#ffffff">${logo}</td></tr>
<tr><td style="background:#121212;padding:14px 24px;color:#ffffff;font-weight:800;letter-spacing:.06em;font-size:13px">INGRESSOS MRV · ARENA MRV</td></tr>
<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121212"><tr>${listras}</tr></table></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">${corpo}${botao}</td></tr>
<tr><td style="padding:16px 24px;background:#F4F5F4;font-size:12px;color:#5D615F">MRV&amp;CO · Patrocinadora da Arena MRV. Seus dados são usados só para emitir o ingresso e orientar o cadastro no Galo ID.</td></tr>
</table></td></tr></table></body></html>`;
}
