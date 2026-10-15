import "server-only";
import { redirect } from "next/navigation";
import { exigirSessao } from "@/lib/sessao";

/** Operação do camarote: perfil Operação e Admin. */
export async function exigirOperacao() {
  const s = await exigirSessao();
  if (s.papel !== "operacao" && s.papel !== "admin") redirect("/eventos");
  return s;
}
