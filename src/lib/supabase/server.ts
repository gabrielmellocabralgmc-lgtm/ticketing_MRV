import "server-only";
// Acesso ao banco pelo servidor. O nome "supabase" ficou por compatibilidade: hoje o banco é um
// Postgres comum (Neon em produção, PGlite no modo demo) com a mesma RLS e as mesmas funções.
// O tipo SupabaseClient é usado só como "formato" — o cliente real é src/lib/db/cliente.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { COOKIE_SESSAO, verificarSessao } from "@/lib/auth/sessao-cookie";
import { criarCliente } from "@/lib/db/cliente";
import { COOKIE_DEMO, MODO_DEMO } from "@/lib/demo/constantes";

/** Cliente com a sessão do usuário logado — RLS se aplica. */
export async function supabaseServidor(): Promise<SupabaseClient> {
  const store = await cookies();
  if (MODO_DEMO) {
    const { clienteDemo } = await import("@/lib/demo/cliente");
    return clienteDemo(store.get(COOKIE_DEMO)?.value ?? null, async () => {
      store.delete(COOKIE_DEMO);
    }) as unknown as SupabaseClient;
  }
  const { executorPg } = await import("@/lib/db/pg");
  const uid = await verificarSessao(store.get(COOKIE_SESSAO)?.value);
  return criarCliente(executorPg, uid, {
    aoSair: async () => {
      store.delete(COOKIE_SESSAO);
    },
  }) as unknown as SupabaseClient;
}

/**
 * Cliente de serviço — ignora RLS (roda como dono das tabelas). Só para as páginas públicas por
 * token (/i/[token]), rotinas automáticas, e-mails e cadastro de usuários. Nunca expor.
 */
export async function supabaseServico(): Promise<SupabaseClient> {
  if (MODO_DEMO) {
    const { clienteDemo } = await import("@/lib/demo/cliente");
    return clienteDemo(null) as unknown as SupabaseClient;
  }
  const { executorPg } = await import("@/lib/db/pg");
  return criarCliente(executorPg, null) as unknown as SupabaseClient;
}
