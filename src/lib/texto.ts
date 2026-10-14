/** Remove espaços extras e nbsp. Retorna null se vazio. */
export function limparNome(v: unknown): string | null {
  const s = String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  return s.length ? s : null;
}

/** Minúsculas, sem acento e sem espaços extras — para comparar nomes/áreas/status. */
export function normalizarTexto(v: unknown): string {
  return (limparNome(v) ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
