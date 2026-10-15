import "server-only";
// Fotos da operação do camarote. Chegam já reduzidas pelo navegador (~1600 px, JPEG, ~200–400 KB).
// Produção (Neon): no próprio banco, na tabela op_arquivos (só o servidor lê).
// Modo demo: numa pasta local.
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { MODO_DEMO } from "@/lib/demo/constantes";

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
  const { pool } = await import("@/lib/db/pg");
  await pool().query(`insert into op_arquivos (caminho, mime, dados) values ($1, $2, $3)`, [caminho, mime, Buffer.from(dados)]);
}

export async function lerFoto(caminho: string): Promise<Uint8Array | null> {
  if (MODO_DEMO) return readFile(local(caminho)).then((b) => new Uint8Array(b)).catch(() => null);
  const { pool } = await import("@/lib/db/pg");
  const { rows } = await pool().query<{ dados: Buffer }>(`select dados from op_arquivos where caminho = $1`, [caminho]);
  return rows[0] ? new Uint8Array(rows[0].dados) : null;
}

export async function apagarFoto(caminho: string) {
  if (MODO_DEMO) return rm(local(caminho), { force: true });
  const { pool } = await import("@/lib/db/pg");
  await pool().query(`delete from op_arquivos where caminho = $1`, [caminho]);
}
