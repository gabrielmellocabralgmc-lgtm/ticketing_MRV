// Separa um texto colado (WhatsApp, e-mail, Excel) em pessoas: nome, CPF, celular, e-mail.
// Aceita uma pessoa por linha, com campos separados por tab, ;, , ou espaços.
import { cpfValido, normalizarCpf } from "@/lib/cpf";
import { limparNome } from "@/lib/texto";

export interface PessoaColada {
  nome: string;
  cpf: string | null;
  celular: string | null;
  email: string | null;
  linha: string;
  problemas: string[];
}

const RE_EMAIL = /[^\s;,<>()]+@[^\s;,<>()]+\.[a-z]{2,}/i;
const RE_CPF = /(?<!\d)(\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/;
// celular BR: (31) 99999-9999 · 31999999999 · +55 31 9 9999-9999
const RE_CEL = /(?:\+?55[\s.-]?)?\(?\b(\d{2})\)?[\s.-]?(9[\s.-]?\d{4}[\s.-]?\d{4})\b/;

export function separarLista(texto: string): PessoaColada[] {
  const out: PessoaColada[] = [];
  for (const bruta of texto.split(/\r?\n/)) {
    let linha = bruta.replace(/ /g, " ").trim();
    if (!linha) continue;
    // remove prefixos de mensagem do WhatsApp ("[14/10 10:32] Fulano: ") e numeração/bullets
    linha = linha.replace(/^\[[^\]]*\]\s*[^:]{1,40}:\s*/, "").replace(/^\s*(?:\d{1,3}[).:-]|[-•*–])\s+/, "");
    const original = linha;
    const problemas: string[] = [];

    const email = linha.match(RE_EMAIL)?.[0]?.toLowerCase() ?? null;
    if (email) linha = linha.replace(RE_EMAIL, " ");

    // Um celular sem formatação também tem 11 dígitos: preferimos o candidato que passa no dígito verificador
    let cpf: string | null = null;
    const candidatos = [...linha.matchAll(new RegExp(RE_CPF, "g"))];
    const mCpf = candidatos.find((c) => cpfValido(c[1])) ?? candidatos.find((c) => /[.-]/.test(c[1])) ?? candidatos[0];
    if (mCpf) {
      cpf = normalizarCpf(mCpf[1]);
      linha = linha.replace(mCpf[0], " ");
      if (!cpfValido(cpf)) problemas.push("CPF inválido");
    }

    let celular: string | null = null;
    const mCel = linha.match(RE_CEL);
    if (mCel) {
      celular = `${mCel[1]}${mCel[2].replace(/\D/g, "")}`;
      linha = linha.replace(mCel[0], " ");
    }

    const nome = limparNome(linha.replace(/\b(cpf|tel|telefone|cel|celular|whats(app)?|e-?mail|nome)\b\s*:?/gi, " ").replace(/[;,|\t:]+/g, " ").replace(/(^|\s)[-–]+(?=\s|$)/g, " "));
    if (!nome) problemas.push("sem nome");
    if (!cpf) problemas.push("sem CPF");
    if (!celular) problemas.push("sem celular");
    // linha só com texto e sem dados → provavelmente comentário ("segue a lista:")
    if (!cpf && !celular && !email && (nome?.split(" ").length ?? 0) > 6) continue;
    out.push({ nome: nome ?? "", cpf, celular, email, linha: original, problemas });
  }
  return out;
}
