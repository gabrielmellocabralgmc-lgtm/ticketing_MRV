const TZ = "America/Sao_Paulo";

export function dataHora(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: TZ }).format(new Date(iso));
}

export function dataLonga(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
}

/** Valor para <input type="datetime-local"> no fuso de Brasília. */
export function paraInputLocal(iso: string | null | undefined) {
  if (!iso) return "";
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return p.replace(" ", "T");
}

/** "2026-10-14T21:30" (horário de Brasília) → ISO com fuso. Brasília não tem horário de verão desde 2019. */
export function deInputLocal(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s ? `${s}:00-03:00` : null;
}

export function celular(v: string | null | undefined) {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return v ?? "";
}

export function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}
