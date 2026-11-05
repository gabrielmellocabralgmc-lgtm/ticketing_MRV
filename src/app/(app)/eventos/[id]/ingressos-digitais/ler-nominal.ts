// Lê nome/CPF de um ingresso nominal a partir do nome do arquivo ou de uma linha colada.
// Ex.: "Maria Souza - 123.456.789-09.pdf", "12345678909_Maria Souza.pdf", "Maria Souza; 12345678909; https://…"
const RE_CPF = /(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/;

export function lerNominal(texto: string): { nome: string | null; cpf: string | null } {
  const base = texto.replace(/\.pdf$/i, "").replace(/https?:\/\/\S+/gi, " ");
  const m = base.match(RE_CPF);
  const cpf = m ? m[1].replace(/\D/g, "") : null;
  const nome = (m ? base.replace(m[1], " ") : base)
    .replace(/^\s*\d{1,3}\s*[-.)]\s*/, "") // numeração do arquivo: "01 - "
    .replace(/[_;|,\t]+/g, " ").replace(/\s[-–]\s/g, " ")
    .replace(/\s+/g, " ").trim();
  return { nome: /[a-zà-ú]{2}/i.test(nome) ? nome : null, cpf };
}

export function lerLinks(texto: string, nominal: boolean) {
  return texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const url = l.match(/https?:\/\/\S+/i)?.[0] ?? null;
    const n = nominal ? lerNominal(l) : { nome: null, cpf: null };
    return { linha: l, url, titular_nome: n.nome, titular_cpf: n.cpf };
  });
}
