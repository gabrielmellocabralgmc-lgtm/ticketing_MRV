// Importação das respostas do Microsoft Forms (CSV ou XLSX) — fase de transição.
// O usuário escolhe na tela qual coluna é o quê; aqui só lemos a tabela e montamos os pedidos.
import ExcelJS from "exceljs";
import { valorCelula, areaParaSlug } from "./planilha";
import { limparNome } from "@/lib/texto";
import type { CampoForms } from "./forms-mapa";
export { ROTULOS_FORMS, sugerirMapa, type CampoForms } from "./forms-mapa";

export interface Tabela {
  cabecalhos: string[];
  linhas: string[][];
}

export function lerCsv(texto: string): Tabela {
  const semBom = texto.replace(/^﻿/, "");
  const primeira = semBom.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : primeira.includes("\t") ? "\t" : ",";
  const linhas: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  for (let i = 0; i < semBom.length; i++) {
    const c = semBom[i];
    if (aspas) {
      if (c === '"' && semBom[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && semBom[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((x) => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim())) linhas.push(linha);
  const [cabecalhos = [], ...resto] = linhas;
  return { cabecalhos: cabecalhos.map((h) => h.trim()), linhas: resto };
}

export async function lerTabela(dados: ArrayBuffer, nomeArquivo: string): Promise<Tabela> {
  if (/\.csv$/i.test(nomeArquivo)) return lerCsv(new TextDecoder("utf-8").decode(dados));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(dados);
  const ws = wb.worksheets[0];
  const linhas: string[][] = [];
  ws.eachRow((row) => {
    const vals: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = valorCelula(row.getCell(c).value);
      vals.push(v === null ? "" : typeof v === "number" ? String(Math.trunc(v) === v ? v : v) : v);
    }
    if (vals.some((x) => x.trim())) linhas.push(vals);
  });
  const [cabecalhos = [], ...resto] = linhas;
  return { cabecalhos: cabecalhos.map((h) => h.trim()), linhas: resto };
}

export interface PedidoForms {
  linha: number;
  areaSlug: string | null;
  areaTexto: string;
  pessoas: { nome: string; cpf: string; celular: string | null; email: string | null }[];
}

export function montarPedidos(t: Tabela, mapa: Partial<Record<CampoForms, number>>): PedidoForms[] {
  const v = (row: string[], k: CampoForms) => (mapa[k] === undefined ? "" : (row[mapa[k]!] ?? "").trim());
  return t.linhas.map((row, i) => {
    const pessoas: PedidoForms["pessoas"] = [];
    if (v(row, "nome") || v(row, "cpf")) {
      pessoas.push({ nome: limparNome(v(row, "nome")) ?? "", cpf: v(row, "cpf"), celular: v(row, "celular") || null, email: v(row, "email") || null });
    }
    if (v(row, "cpf_convidado")) {
      const titular = pessoas[0]?.nome || "colaborador";
      pessoas.push({ nome: limparNome(v(row, "nome_convidado")) ?? `Convidado de ${titular}`, cpf: v(row, "cpf_convidado"), celular: v(row, "celular_convidado") || null, email: null });
    }
    const areaTexto = v(row, "area");
    return { linha: i + 2, areaSlug: areaTexto ? areaParaSlug(areaTexto) : null, areaTexto, pessoas };
  }).filter((p) => p.pessoas.length > 0);
}
