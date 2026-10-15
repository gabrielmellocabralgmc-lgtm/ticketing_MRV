import "server-only";
// Fotos da operação do camarote. Ficam FORA do banco (o banco guarda só o registro):
// em produção, no Supabase Storage (bucket privado "operacao"); no modo demo, numa pasta local.
// As fotos chegam já reduzidas pelo navegador (~1600 px, JPEG), em torno de 200–400 KB cada.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MODO_DEMO } from "@/lib/demo/constantes";
import { supabaseServico } from "@/lib/supabase/server";

const BUCKET = "operacao";
const PASTA_DEMO = path.join(process.cwd(), ".demo.nosync", "fotos");
export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_FOTO = 5 * 1024 * 1024;

const local = (caminho: string) => {
  const p = path.join(PASTA_DEMO, caminho);
  if (!p.startsWith(PASTA_DEMO + path.sep)) throw new Error("caminho inválido");
  return p;
};

export async function salvarFoto(caminho: string, dados: Uint8Array, mime: string) {
  if (MODO_DEMO) {
    await mkdir(path.dirname(local(caminho)), { recursive: true });
    await writeFile(local(caminho), dados);
    return;
  }
  const { error } = await (await supabaseServico()).storage.from(BUCKET).upload(caminho, dados, { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
}

export async function lerFoto(caminho: string): Promise<Uint8Array | null> {
  if (MODO_DEMO) return readFile(local(caminho)).then((b) => new Uint8Array(b)).catch(() => null);
  const { data } = await (await supabaseServico()).storage.from(BUCKET).download(caminho);
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}

export async function apagarFoto(caminho: string) {
  if (MODO_DEMO) return rm(local(caminho), { force: true });
  await (await supabaseServico()).storage.from(BUCKET).remove([caminho]);
}
