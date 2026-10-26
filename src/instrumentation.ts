// Ao subir o servidor (Node, ex. Railway): liga as rotinas automáticas, exceto no modo demo, na Vercel
// ou sem CRON_SECRET.
// Para desligar (ex.: se um dia voltar a usar um cron externo): CRON_INTERNO=0.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL) return; // na Vercel as rotinas vêm do GitHub Actions + cron diário (vercel.json)
  if (process.env.NEXT_PUBLIC_DEMO === "1" || !process.env.CRON_SECRET || process.env.CRON_INTERNO === "0") return;
  const { iniciarAgenda } = await import("./lib/agenda");
  iniciarAgenda();
}
