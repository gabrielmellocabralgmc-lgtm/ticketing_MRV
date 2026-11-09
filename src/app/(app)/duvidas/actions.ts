"use server";
import { revalidatePath } from "next/cache";
import { falha, type Resultado } from "@/lib/erros";
import { marcarStatus, registrarMensagem, type Status } from "@/lib/duvidas";
import { exigirAdmin } from "@/lib/sessao";

/** Equipe (Admin act.3) responde: a pessoa é avisada por e-mail. */
export async function responderDuvida(id: string, texto: string): Promise<Resultado> {
  const s = await exigirAdmin();
  try {
    await registrarMensagem(id, "equipe", s.userId, s.nome, texto);
  } catch (e) {
    return falha(e);
  }
  revalidatePath("/duvidas");
  return { ok: true, mensagem: "Resposta enviada. A pessoa foi avisada por e-mail." };
}

export async function mudarStatusDuvida(id: string, status: Status): Promise<Resultado> {
  await exigirAdmin();
  await marcarStatus(id, status);
  revalidatePath("/duvidas");
  return { ok: true };
}
