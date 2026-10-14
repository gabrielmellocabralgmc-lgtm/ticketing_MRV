import { createBrowserClient } from "@supabase/ssr";
import { MODO_DEMO } from "@/lib/demo/constantes";

export function supabaseNavegador() {
  if (MODO_DEMO) {
    // modo demonstração: sem Realtime (as telas atualizam ao navegar/agir)
    const canal = { on: () => canal, subscribe: () => canal };
    return { channel: () => canal, removeChannel: () => {} } as unknown as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
