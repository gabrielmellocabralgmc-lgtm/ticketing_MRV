import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
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
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (lista) => {
        try {
          lista.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // chamado de um Server Component: o middleware renova a sessão
        }
      },
    },
  });
}

/**
 * Cliente com service role — ignora RLS. Só para as páginas públicas por token (/i/[token]),
 * cron e cadastro de usuários. Nunca expor ao navegador.
 */
export async function supabaseServico(): Promise<SupabaseClient> {
  if (MODO_DEMO) {
    const { clienteDemo } = await import("@/lib/demo/cliente");
    return clienteDemo(null) as unknown as SupabaseClient;
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
