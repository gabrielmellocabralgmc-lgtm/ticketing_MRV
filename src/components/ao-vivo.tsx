"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseNavegador } from "@/lib/supabase/navegador";

/** Recarrega os dados da página quando algum ingresso do evento muda (Supabase Realtime, respeita RLS). */
export function AoVivo({ evento }: { evento: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = supabaseNavegador();
    let t: ReturnType<typeof setTimeout> | undefined;
    const canal = supabase
      .channel(`ingressos-${evento}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ingressos", filter: `evento_id=eq.${evento}` }, () => {
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
