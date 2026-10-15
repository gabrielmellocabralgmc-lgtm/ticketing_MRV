// Cria (ou promove) um Admin no banco de produção.
//   DATABASE_URL=... npm run criar-admin -- email@mrv.com.br "Nome Sobrenome"
// (No primeiro deploy, basta definir ADMIN_EMAIL/ADMIN_NOME no Railway: o deploy cria sozinho.)
import pg from "pg";

const [email, nome = "Admin"] = process.argv.slice(2);
if (!email) {
  console.error('Uso: npm run criar-admin -- email@dominio "Nome"');
  process.exit(1);
}
const url = process.env.DATABASE_URL_DIRETA || process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url ?? "") ? undefined : { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query(
  `insert into auth.users (email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
   values ($1, $2, now(), now(), now()) on conflict (email) do update set updated_at = now() returning id`,
  [email.toLowerCase(), JSON.stringify({ nome })]);
await c.query(
  `insert into perfis (user_id, nome, email, papel, ativo) values ($1, $2, $3, 'admin', true)
   on conflict (user_id) do update set papel = 'admin', ativo = true`, [rows[0].id, nome, email.toLowerCase()]);
await c.end();
console.log(`✓ ${email} é Admin.`);
