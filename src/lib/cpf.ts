// CPF: normalização, validação (dígitos verificadores), formatação e máscara.
// Estrangeiro: se o documento tiver alguma LETRA, é tratado como passaporte
// (só letras e números, em maiúsculas, de 5 a 20 caracteres). Fica no mesmo campo "cpf".
// A planilha legada guarda CPF como número e perde zeros à esquerda
// (ex.: 1529297621 → 015.292.976-21), por isso completamos até 11 dígitos.

export function somenteDigitos(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\D/g, "");
}

/** Tem letra → é passaporte (estrangeiro). */
export function ehPassaporte(valor: unknown): boolean {
  return typeof valor === "string" && /[a-z]/i.test(valor);
}

/** Passaporte: só letras e números, maiúsculas; null se não tiver de 5 a 20 caracteres. */
export function normalizarPassaporte(valor: unknown): string | null {
  const p = String(valor ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  return p.length >= 5 && p.length <= 20 ? p : null;
}

/** Retorna os 11 dígitos do CPF (completando zeros à esquerda), o passaporte normalizado, ou null. */
export function normalizarCpf(valor: unknown): string | null {
  if (ehPassaporte(valor)) return normalizarPassaporte(valor);
  // Números vindos do Excel podem chegar como 1529297621.0
  const bruto = typeof valor === "number" ? Math.trunc(valor).toString() : String(valor ?? "").trim();
  const digitos = somenteDigitos(bruto);
  if (digitos.length === 0 || digitos.length > 11) return null;
  return digitos.padStart(11, "0");
}

export function cpfValido(valor: unknown): boolean {
  if (ehPassaporte(valor)) return normalizarPassaporte(valor) !== null;
  const d = normalizarCpf(valor);
  if (!d || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}

export function formatarCpf(valor: unknown): string {
  if (ehPassaporte(valor)) return normalizarPassaporte(valor) ?? String(valor);
  const d = normalizarCpf(valor);
  if (!d) return String(valor ?? "");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** ***.456.789-** */
export function mascararCpf(valor: unknown): string {
  if (ehPassaporte(valor)) {
    const p = normalizarPassaporte(valor);
    return p ? `Pass. ${p.slice(0, 2)}***${p.slice(-2)}` : "";
  }
  const d = normalizarCpf(valor);
  if (!d) return "";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}
