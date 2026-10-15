"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

const INTERVALO_MS = 20_000;

/**
 * Mantém a tela atualizada: recarrega os dados a cada 20 s enquanto a aba está visível
 * e logo que a pessoa volta para ela. (Sem Supabase Realtime: funciona em qualquer Postgres.)
 */
export function AoVivo(_: { evento?: string }) {
  const router = useRouter();
  useEffect(() => {
    const atualizar = () => { if (document.visibilityState === "visible") router.refresh(); };
    const t = setInterval(atualizar, INTERVALO_MS);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [router]);
  return null;
}
