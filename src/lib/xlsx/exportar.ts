// Exporta um evento no mesmo layout da planilha legada (abas Arquibancada/Pista, Camarote,
// Convidados Camarote, Divisão) para quem ainda trabalha no Excel.
import ExcelJS from "exceljs";
import { formatarCpf } from "@/lib/cpf";
import { STATUS_INGRESSO, type Setor, type StatusIngresso } from "@/lib/tipos";

export interface LinhaExport {
  id: string;
  pedido_id: string;
  setor: Setor;
  area_nome: string;
  area_ordem: number;
  status: StatusIngresso;
  nome: string | null;
  cpf: string | null;
  celular: string | null;
  convidado_de: string | null;
  convidado_de_nome: string | null;
  indicacao_de: string | null;
  preenchido_por: string | null;
  observacao: string | null;
}

const ENVIADO: StatusIngresso[] = ["enviado", "confirmado", "presente", "no_show"];
const CONTA: StatusIngresso[] = ["convite_enviado", "aguardando_preenchimento", "solicitado", "validado_area", "aprovado", "facial_pendente", "facial_ok", ...ENVIADO];
const VERDE = "FF006B3F";

function cabecalho(ws: ExcelJS.Worksheet, titulo: string, evento: string, colunas: string[], larguras: number[]) {
  ws.mergeCells(1, 1, 1, colunas.length);
  ws.mergeCells(2, 1, 2, colunas.length);
  ws.getCell(1, 1).value = titulo;
  ws.getCell(2, 1).value = evento;
  for (const r of [1, 2]) {
    const c = ws.getCell(r, 1);
    c.font = { bold: true, size: r === 1 ? 14 : 12, color: { argb: r === 1 ? "FFFFFFFF" : VERDE } };
    if (r === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERDE } };
    c.alignment = { horizontal: "center" };
  }
  const h = ws.getRow(4);
  h.values = colunas;
  h.font = { bold: true };
  h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4EC" } }));
  larguras.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.views = [{ state: "frozen", ySplit: 4 }];
}

const statusTexto = (s: StatusIngresso) => (ENVIADO.includes(s) ? "Enviado" : STATUS_INGRESSO[s].rotulo);
const cpfTexto = (c: string | null) => (c ? formatarCpf(c) : ""); // texto: não perde zeros à esquerda

export async function exportarEvento(o: {
  titulo: string; dataCurta: string; linhas: LinhaExport[];
  setores: { setor: Setor; capacidade: number }[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ingressos MRV";
  const evento = `${o.titulo} (${o.dataCurta})`;
  const ativas = o.linhas.filter((l) => CONTA.includes(l.status));

  // ------------------------------------------------ Arquibancada / Pista: 1 linha por titular + CPF do convidado
  for (const setor of ["arquibancada", "pista"] as const) {
    const doSetor = ativas.filter((l) => l.setor === setor);
    if (!o.setores.some((s) => s.setor === setor)) continue;
    const nomeAba = setor === "arquibancada" ? "Arquibancada" : "Pista";
    const ws = wb.addWorksheet(nomeAba);
    cabecalho(ws, `Gestão de Ingressos MRV&CO - ${nomeAba}`, evento,
      ["Setor", "Nome", "Telefone", "CPF", "CPF do convidado", "Forms", "RESERVADOS", "ENVIADOS", "Status", "Observação"],
      [24, 36, 16, 16, 18, 8, 12, 11, 22, 36]);
    const porPedido = new Map<string, LinhaExport[]>();
    for (const l of doSetor) porPedido.set(l.pedido_id, [...(porPedido.get(l.pedido_id) ?? []), l]);
    const grupos = [...porPedido.values()].sort((a, b) => a[0].area_ordem - b[0].area_ordem || a[0].area_nome.localeCompare(b[0].area_nome));
    let totRes = 0, totEnv = 0;
    for (const g of grupos) {
      const titular = g.find((l) => !l.convidado_de) ?? g[0];
      const convidados = g.filter((l) => l !== titular);
      const pendentes = g.filter((l) => !l.nome).length;
      const enviados = g.filter((l) => ENVIADO.includes(l.status)).length;
      totRes += g.length;
      totEnv += enviados;
      const obs = [
        titular.indicacao_de && `Indicação: ${titular.indicacao_de}`,
        titular.observacao,
        pendentes && `${pendentes} vaga(s) aguardando preenchimento`,
        convidados.length > 1 && `Outros convidados: ${convidados.slice(1).map((c) => `${c.nome ?? "?"} ${cpfTexto(c.cpf)}`).join(", ")}`,
        g.some((l) => l.preenchido_por === "convidado") && "Preenchido pelo convidado",
      ].filter(Boolean).join(" · ");
      ws.addRow([
        titular.area_nome, titular.nome ?? (titular.indicacao_de ? `Vaga: ${titular.indicacao_de}` : "Vaga reservada"),
        titular.celular ?? "", cpfTexto(titular.cpf), cpfTexto(convidados[0]?.cpf ?? null),
        titular.preenchido_por === "importacao" ? "" : "Sim", g.length, enviados || null, statusTexto(titular.status), obs || null,
      ]);
    }
    ws.getCell("A3").value = "Total";
    ws.getCell("G3").value = totRes;
    ws.getCell("H3").value = totEnv;
    ws.getRow(3).font = { bold: true };
  }

  // ------------------------------------------------ Camarote: 1 linha por pessoa
  const cam = ativas.filter((l) => l.setor === "camarote");
  if (o.setores.some((s) => s.setor === "camarote")) {
    const ws = wb.addWorksheet("Camarote");
    cabecalho(ws, "Gestão de Ingressos MRV&CO - Camarote", evento,
      ["Nome", "CPF", "RESERVADOS", "ENVIADOS", "INDICAÇÃO", "STATUS", "Observação", "Área MRV", "Convidado de"],
      [42, 16, 12, 11, 22, 22, 30, 24, 30]);
    for (const l of cam) {
      ws.addRow([l.nome ?? "", cpfTexto(l.cpf), 1, ENVIADO.includes(l.status) ? 1 : null, l.indicacao_de ?? "",
        l.nome ? statusTexto(l.status) : "RESERVADO", l.observacao ?? null, l.area_nome, l.convidado_de_nome ?? (l.convidado_de ? "?" : "Anfitrião")]);
    }
    ws.getCell("C3").value = cam.length;
    ws.getCell("D3").value = cam.filter((l) => ENVIADO.includes(l.status)).length;
    ws.getRow(3).font = { bold: true };

    const wc = wb.addWorksheet("Convidados Camarote");
    wc.mergeCells("A1:E1");
    wc.getCell("A1").value = evento;
    wc.getCell("A1").font = { bold: true, size: 13, color: { argb: VERDE } };
    wc.getRow(2).values = ["", "Nome", "QT", "Convidado do:", "Indicação de:"];
    wc.getRow(2).font = { bold: true };
    [6, 42, 6, 32, 24].forEach((w, i) => (wc.getColumn(i + 1).width = w));
    cam.filter((l) => l.nome).sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
      .forEach((l, i) => wc.addRow([i + 1, l.nome, 1, l.convidado_de_nome ?? (l.convidado_de ? "?" : "(anfitrião)"), l.indicacao_de ?? ""]));
  }

  // ------------------------------------------------ Divisão
  const wd = wb.addWorksheet("Divisão");
  wd.mergeCells("B1:H1");
  wd.getCell("B1").value = "Gestão de ingressos MRV&CO - Divisão de ingressos";
  wd.getCell("B2").value = evento;
  wd.getCell("B1").font = { bold: true, size: 14, color: { argb: VERDE } };
  let r = 4;
  const ordem: Setor[] = ["camarote", "arquibancada", "pista"];
  for (const s of [...o.setores].sort((a, b) => ordem.indexOf(a.setor) - ordem.indexOf(b.setor))) {
    const l = ativas.filter((x) => x.setor === s.setor);
    const enviados = l.filter((x) => ENVIADO.includes(x.status)).length;
    wd.getCell(r, 2).value = s.setor === "camarote" ? "Camarote" : s.setor === "pista" ? "Pista" : "Arquibancada";
    wd.getCell(r, 2).font = { bold: true, color: { argb: VERDE } };
    const linhas: [string, number][] = [
      ["Ingressos disponibilizados", s.capacidade],
      ["Ingressos reservados", l.length],
      ["Ingressos enviados", enviados],
      ["Saldo disponível", s.capacidade - l.length],
      ["Ingressos a enviar", l.length - enviados],
    ];
    // mesmo lugar da planilha legada: "Ingressos disponibilizados" na linha 6 (D6)
    linhas.forEach(([k, v], i) => { wd.getCell(r + 2 + i, 2).value = k; wd.getCell(r + 2 + i, 4).value = v; });
    r += linhas.length + 3;
    wd.getRow(r).values = ["", "Área", "", "Ingressos", "%"];
    wd.getRow(r).font = { bold: true };
    const porArea = new Map<string, number>();
    for (const x of l) porArea.set(x.area_nome, (porArea.get(x.area_nome) ?? 0) + 1);
    for (const [area, n] of [...porArea].sort((a, b) => b[1] - a[1])) {
      r++;
      wd.getRow(r).values = ["", area, "", n, l.length ? n / l.length : 0];
      wd.getCell(r, 5).numFmt = "0%";
    }
    r++;
    wd.getRow(r).values = ["", "Total alocados", "", l.length];
    wd.getRow(r).font = { bold: true };
    r += 3;
  }
  wd.getColumn(2).width = 30;
  wd.getColumn(4).width = 12;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
