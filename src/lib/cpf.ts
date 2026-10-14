// CPF: normalização, validação (dígitos verificadores), formatação e máscara.
// A planilha legada guarda CPF como número e perde zeros à esquerda
// (ex.: 1529297621 → 015.292.976-21), por isso completamos até 11 dígitos.

export function somenteDigitos(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\D/g, "");
}

/** Retorna os 11 dígitos do CPF (completando zeros à esquerda) ou null se não for possível. */
export function normalizarCpf(valor: unknown): string | null {
  // Números vindos do Excel podem chegar como 1529297621.0
  const bruto = typeof valor === "number" ? Math.trunc(valor).toString() : String(valor ?? "").trim();
  const digitos = somenteDigitos(bruto);
  if (digitos.length === 0 || digitos.length > 11) return null;
  return digitos.padStart(11, "0");
}

export function cpfValido(valor: unknown): boolean {
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
  const d = normalizarCpf(valor);
  if (!d) return String(valor ?? "");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** ***.456.789-** */
export function mascararCpf(valor: unknown): string {
  const d = normalizarCpf(valor);
  if (!d) return "";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}
