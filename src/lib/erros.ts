// O banco devolve erros de negócio como "CODIGO: mensagem em português".
export interface ErroNegocio {
  codigo: string;
  mensagem: string;
}

export function lerErro(e: unknown): ErroNegocio {
  const bruto = typeof e === "string" ? e : e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "Erro inesperado";
  const m = bruto.match(/^([A-Z_]{4,}):\s*([\s\S]*)$/);
  if (m) return { codigo: m[1], mensagem: m[2] };
  if (/permission denied|row-level security/i.test(bruto)) return { codigo: "SEM_PERMISSAO", mensagem: "Você não tem permissão para esta ação." };
  return { codigo: "ERRO", mensagem: bruto };
}

export type Resultado<T = undefined> = { ok: true; dados?: T; mensagem?: string } | { ok: false; erro: string; codigo?: string };

export function falha(e: unknown): { ok: false; erro: string; codigo: string } {
  const { codigo, mensagem } = lerErro(e);
  return { ok: false, erro: mensagem, codigo };
}
