// Mapeamento de colunas do Forms (sem dependências pesadas: usado também no navegador).
export type CampoForms = "area" | "nome" | "cpf" | "celular" | "email" | "nome_convidado" | "cpf_convidado" | "celular_convidado";
export const ROTULOS_FORMS: Record<CampoForms, string> = {
  area: "Área", nome: "Nome do colaborador", cpf: "CPF do colaborador", celular: "Celular do colaborador", email: "E-mail",
  nome_convidado: "Nome do convidado", cpf_convidado: "CPF do convidado", celular_convidado: "Celular do convidado",
};

/** Sugere o mapeamento pelo texto do cabeçalho. */
export function sugerirMapa(cabecalhos: string[]): Partial<Record<CampoForms, number>> {
  const n = cabecalhos.map((h) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
  const achar = (re: RegExp, nao?: RegExp) => { const i = n.findIndex((h) => re.test(h) && !(nao && nao.test(h))); return i >= 0 ? i : undefined; };
  return {
    area: achar(/\b(area|setor|diretoria)\b/),
    nome: achar(/nome/, /convidad|acompanh/),
    cpf: achar(/cpf/, /convidad|acompanh/),
    celular: achar(/(celular|telefone|whats)/, /convidad|acompanh/),
    email: achar(/e-?mail/, /convidad|acompanh/),
    nome_convidado: achar(/nome.*(convidad|acompanh)|(convidad|acompanh).*nome/),
    cpf_convidado: achar(/cpf.*(convidad|acompanh)|(convidad|acompanh).*cpf/),
    celular_convidado: achar(/(celular|telefone|whats).*(convidad|acompanh)|(convidad|acompanh).*(celular|telefone|whats)/),
  };
}

