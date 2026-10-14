"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/navegador";

/**
 * Recarrega os dados da página quando algum ingresso muda (Supabase Realtime, respeita RLS).
 * Sem `evento`, escuta todos (dashboard).
 */
export function AoVivo({ evento }: { evento?: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = supabaseNavegador();
    let t: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel(`ingressos-${evento ?? "todos"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ingressos", ...(evento ? { filter: `evento_id=eq.${evento}` } : {}) }, () => {
        clearTimeout(t);
        t = setTimeout(() => router.refresh(), 600);
      })
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(canal);
    };
  }, [evento, router]);
  return null;
}
