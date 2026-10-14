// Cria (ou promove) o primeiro Admin num projeto Supabase novo.
//   npm run criar-admin -- email@mrv.com.br "Nome Sobrenome"
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const [email, nome = "Admin"] = process.argv.slice(2);
  if (!email) throw new Error('Uso: npm run criar-admin -- email@dominio "Nome"');
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const criado = await sb.auth.admin.createUser({ email: email.toLowerCase(), email_confirm: true, user_metadata: { nome } });
  let id = criado.data.user?.id;
  if (!id) {
    const { data } = await sb.auth.admin.listUsers({ perPage: 1000 });
    id = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
  }
  if (!id) throw criado.error ?? new Error("Não foi possível criar o usuário");
  const { error } = await sb.from("perfis").upsert({ user_id: id, nome, email: email.toLowerCase(), papel: "admin", ativo: true });
  if (error) throw error;
  console.log(`✓ ${email} é Admin. Entre em ${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/login`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
