// Rotinas automáticas sem Vercel Cron: o próprio servidor (Railway) dispara as rotas
// /api/cron/* nos mesmos horários de antes (UTC), com o CRON_SECRET.
// Roda uma vez por processo; no Railway há uma instância só.
const ROTINAS: { rota: string; quando: (min: number, hora: number) => boolean }[] = [
  { rota: "expirar-convites", quando: (m) => m % 30 === 0 },
  { rota: "fechar-prazos", quando: (m) => m === 5 },
  { rota: "encerrar-eventos", quando: (m) => m === 15 },
  { rota: "lembretes", quando: (m) => m === 0 },
  { rota: "retencao", quando: (m, h) => m === 30 && h === 6 },
];

type Global = { __agendaIniciada?: boolean };

export function iniciarAgenda() {
  const g = globalThis as Global;
  if (g.__agendaIniciada) return;
  g.__agendaIniciada = true;
  const base = `http://127.0.0.1:${process.env.PORT ?? 3000}/api/cron`;
  let ultimo = "";
  setInterval(async () => {
    const d = new Date();
    const chave = `${d.getUTCHours()}:${d.getUTCMinutes()}`;
    if (chave === ultimo) return; // no máximo uma vez por minuto
    ultimo = chave;
    for (const r of ROTINAS.filter((x) => x.quando(d.getUTCMinutes(), d.getUTCHours()))) {
      try {
        const res = await fetch(`${base}/${r.rota}`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
        console.log(`[agenda] ${r.rota}: ${res.status} ${(await res.text()).slice(0, 200)}`);
      } catch (e) {
        console.error(`[agenda] ${r.rota} falhou:`, e instanceof Error ? e.message : e);
      }
    }
  }, 20_000);
  console.log("[agenda] rotinas automáticas ativas");
}
