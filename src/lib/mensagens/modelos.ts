// Modelos de e-mail: troca de {{variaveis}} e HTML com a identidade MRV + Galo ID.
// Sem dependências de servidor (usado também na prévia do editor).

export const VARIAVEIS: Record<string, string> = {
  jogo: "Nome da partida (Galo × Coritiba)",
  quando: "Dia, data e hora curtos (Domingo, 11/10 | 16:00h)",
  data: "Data e hora do jogo por extenso",
  portoes: "Abertura dos portões",
  prazo: "Prazo para as áreas solicitarem (por extenso)",
  prazo_curto: "Prazo curto (Quarta-feira, 07/10, às 16h)",
  prazo_validacao: "Prazo para validar a lista (igual ao de solicitação)",
  area: "Nome da área",
  responsavel: "Primeiro nome do responsável",
  cota: "Cota da área (ex.: 10)",
  saldo: "Saldo ainda não usado pela área",
  pendentes: "Convidados aguardando validação",
  lista: "Lista de nomes, um por linha (convidados a validar ou confirmados no camarote)",
  setor: "Setor (Arquibancada, Pista, Camarote)",
  nome: "Primeiro nome do convidado",
  lugares: "Quantidade de lugares do convite",
  validade: "Validade do link de convite",
  link: "Link da área ou da página do convidado",
  evento: "Nome do evento (igual a {{jogo}}; mais natural nos shows)",
  como_receber: "Passo a passo de como o convidado recebe o ingresso (PDF/link por e-mail, Super App do Galo…)",
  orientacoes: "Orientações extras do evento para o convidado (campo do cadastro do evento), uma por linha",
  requisito_email: "“ e o e-mail (é por ele que o ingresso chega)” nos eventos com ingresso digital",
  requisitos_facial: "Orientações da facial (Super App do Galo) — vazio nos eventos sem facial",
  facial_frase: "“, com cadastro facial no Super App do Galo” — vazio nos eventos sem facial",
  contato: "Para onde vão os pedidos do camarote (e-mail/WhatsApp do Marketing)",
  total: "Quantidade de convidados confirmados no camarote",
  presenca: "Presença no camarote (chegaram × confirmados)",
  horarios: "Abertura / encerramento do camarote",
  avaliacao: "Avaliação geral da operação (1 a 5)",
  resumo: "Resumo do jogo (relatório da operação)",
  ocorrencias: "Ocorrências (relatório da operação)",
  manutencao: "Manutenção e pendências (relatório da operação)",
  problemas: "Itens com problema nos check-lists",
  bebidas: "Consumo de bebidas no jogo",
};

/** Exemplo usado na prévia do editor. */
export const EXEMPLO: Record<string, string> = {
  jogo: "Galo × Coritiba", quando: "Sábado, 17/10 | 19:00h", prazo_curto: "Sexta-feira, 16/10, às 12h", data: "sábado, 17 de outubro às 19:00", portoes: "16:00",
  prazo: "sexta, 16/10 às 12:00", prazo_validacao: "sexta, 16/10 às 12:00", area: "DH", responsavel: "Ana",
  cota: "10", saldo: "4", pendentes: "2", setor: "Arquibancada (Inter Oeste)", nome: "João", lugares: "2 lugares",
  validade: "16/10 às 12:00", evento: "Gilberto Gil", requisito_email: " e o e-mail (é por ele que o ingresso chega)",
  como_receber: "O ingresso chega por e-mail (remetente naoresponda@ingressos.weareact3.com), com o botão “Baixar meu ingresso”: pode ser um PDF ou um link da bilheteria, conforme o evento.", requisitos_facial: "2. Tenham cadastro ativo no Super App do Galo, inclusive os acompanhantes.\n3. Concluam o cadastro facial no site https://ingressos.galonaveia.com.br/", facial_frase: ", com cadastro facial no Super App do Galo", lista: "• João Silva\n• Maria Souza", orientacoes: "• Menores de 16 anos só entram acompanhados dos pais ou responsável legal.",
  contato: "marketing@mrv.com.br", total: "12", presenca: "10 de 12 convidados chegaram", horarios: "14:00 / 19:30", avaliacao: "5 de 5",
  resumo: "Operação tranquila.", ocorrencias: "Nenhuma.", manutencao: "Trocar lâmpada do LED testeira.", problemas: "• LEDs: LED testeira — piscando",
  bebidas: "• Cerveja (lata 350 ml): 36 latas (sobraram 12)", link: "https://ingressos.weareact3.com/…",
};

export function preencher(texto: string, vars: Record<string, string | number | null | undefined>) {
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = vars[k];
    // dado ausente vira "—"; texto vazio de propósito (ex.: trecho de facial num show) some
    return v === null || v === undefined ? "—" : String(v);
  });
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texto simples → HTML de e-mail (tabelas e estilos inline, para funcionar nos clientes de e-mail). */
/** Averta (fonte da MRV): usada por quem a tem instalada ou quando os arquivos web estão em /public/fonts;
 *  nos demais leitores (Gmail, Outlook do Windows) cai para Arial. */
export const FONTE_EMAIL = "'Averta',Arial,Helvetica,sans-serif";
/** Títulos: Averta Bold (a "Averta Std" instalada costuma ser só a Bold, por isso fica fora do texto corrido). */
export const FONTE_TITULO_EMAIL = "'Averta','Averta Std',Arial,Helvetica,sans-serif";
const estiloTitulo = `font-family:${FONTE_TITULO_EMAIL};font-weight:700`;
function fontFaceAverta(siteUrl?: string) {
  if (!siteUrl) return "";
  const f = (peso: number, arq: string) => `@font-face{font-family:'Averta';font-style:normal;font-weight:${peso};src:url('${siteUrl}/fonts/${arq}.woff2') format('woff2'),url('${siteUrl}/fonts/${arq}.woff') format('woff');}`;
  return `<style>${f(400, "averta-regular")}${f(700, "averta-bold")}${f(800, "averta-extrabold")}</style>`;
}

export function htmlEmail(texto: string, opcoes: { logoUrl?: string; botao?: { rotulo: string; url: string }; capaUrl?: string; mapaUrl?: string; siteUrl?: string } = {}) {
  const corpo = escapar(texto)
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#00843D">$1</a>')
    .split(/\n{2,}/)
    .map((p) => {
      // ":: SOBRE O EVENTO" vira título de seção (o resto do parágrafo segue como texto)
      const m = p.match(/^::\s*([^\n]+)\n?([\s\S]*)$/);
      if (!m) return `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`;
      const titulo = `<p style="margin:24px 0 8px;${estiloTitulo};font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#006B3F">${m[1].trim()}</p>`;
      return m[2].trim() ? `${titulo}<p style="margin:0 0 14px">${m[2].replace(/\n/g, "<br>")}</p>` : titulo;
    })
    .join("");
  const logo = opcoes.logoUrl
    ? `<img src="${escapar(opcoes.logoUrl)}" alt="MRV" height="32" style="height:32px;display:block">`
    : `<span style="background:#00843D;color:#fff;font-weight:800;font-size:15px;padding:4px 8px;border-radius:6px;${estiloTitulo}">MRV</span>`;
  const listras = Array.from({ length: 12 }, (_, i) => `<td style="height:6px;background:${i % 2 ? "#121212" : "#ffffff"}"></td>`).join("");
  const botao = opcoes.botao
    ? `<p style="margin:22px 0 6px"><a href="${escapar(opcoes.botao.url)}" style="display:inline-block;background:#00843D;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;${estiloTitulo}">${escapar(opcoes.botao.rotulo)}</a></p>`
    : "";
  const mapa = opcoes.mapaUrl
    ? `<p style="margin:24px 0 8px;${estiloTitulo};font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#006B3F">Mapa do evento</p>
<a href="${escapar(opcoes.mapaUrl)}" style="display:block;text-decoration:none"><img src="${escapar(opcoes.mapaUrl)}" alt="Mapa do evento" width="512" style="display:block;width:100%;max-width:512px;height:auto;border:1px solid #E5E5E5;border-radius:8px"></a>
<p style="margin:6px 0 0;font-size:12px;color:#5D615F">Toque no mapa para ampliar.</p>`
    : "";
  const capa = opcoes.capaUrl
    ? `<tr><td style="padding:0;line-height:0"><img src="${escapar(opcoes.capaUrl)}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>`
    : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${fontFaceAverta(opcoes.siteUrl)}</head><body style="margin:0;background:#F4F5F4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E5E5E5;border-radius:16px;overflow:hidden;font-family:${FONTE_EMAIL};color:#242625">
<tr><td style="padding:18px 24px;background:#ffffff">${logo}</td></tr>
<tr><td style="background:#121212;padding:14px 24px;color:#ffffff;${estiloTitulo};letter-spacing:.06em;font-size:13px">INGRESSOS MRV · ARENA MRV</td></tr>
<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121212"><tr>${listras}</tr></table></td></tr>
${capa}
<tr><td style="padding:24px;font-size:15px;line-height:1.55">${corpo}${mapa}${botao}</td></tr>
<tr><td style="padding:16px 24px;background:#F4F5F4;font-size:12px;color:#5D615F">MRV&amp;CO · Patrocinadora da Arena MRV. Seus dados são usados só para emitir o ingresso e orientar o cadastro no Galo ID.</td></tr>
</table></td></tr></table></body></html>`;
}
