// Gera uma planilha no layout legado com dados FICTÍCIOS (a planilha real tem CPFs reais e não entra no repositório).
import ExcelJS from "exceljs";
import { cpfFake } from "../db/helpers";

export async function gerarPlanilhaLegada(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const arq = wb.addWorksheet("Arquibancada "); // nome com espaço, como na original
  arq.getCell("A1").value = "Gestão de Ingressos MRV&CO - Arquibancada";
  arq.getCell("A2").value = "Galo vs Teste FC (05.11)";
  arq.getCell("G3").value = 5;
  arq.getCell("H3").value = 6;
  arq.addRow([]);
  arq.getRow(4).values = ["Setor ", "Nome ", "Telefone", "CPF  ", "CPF do convidado ", "Forms ", "RESERVADOS", "ENVIADOS", "Status", "Observação"];
  const n = (s: number) => Number(cpfFake(s)); // CPF como número: perde zeros à esquerda
  const linhas = [
    ["Comercial Corp", "Ana  Teste ", null, n(1), n(2), "Sim", 2, 2, "Enviado", null],
    ["Comercial Corp", "Bruno Sem Forms", null, null, null, null, null, null, "PENDENTE", null],
    ["DH", "Carla Teste ", null, cpfFake(3), cpfFake(4), "Sim", 2, 2, "ENVIADO", null],
    ["DI", "Diego Teste", null, n(5), n(6), "Sim", 2, 1, "PENDENTE", "convidado sem cadastro"],
    ["Comercial BH ", "Elisa Teste", null, n(7), null, "Sim", 1, 1, "Enviado", null],
    ["Presidencia", "Fabio Teste", null, n(8), null, "Não", 1, 1, null, null],
    ["Presidencia", null, null, n(9), null, "Não", 1, null, "pendente", "já tem ingresso"],
    ["Relacionamento Institucional", "Gil Teste", null, n(10), null, "Não", 1, 1, "Enviado", "Rafinha"],
    ["Marketing", null, null, null, null, null, null, null, null, null],
    ["Luggo ", "Duplicado Teste", null, n(1), null, "Sim", 1, 1, "Enviado", null],
    ["DH", "CPF Ruim", null, "123.456.789-00", null, "Sim", 1, null, "Pendente", null],
  ];
  for (const l of linhas) arq.addRow(l);

  const cam = wb.addWorksheet("Camarote");
  cam.getCell("A2").value = "Galo vs Teste FC (05.11)";
  cam.getRow(4).values = ["Nome ", "CPF", "RESERVADOS", "ENVIADOS", "INDICAÇÃO ", "STATUS", "Observação"];
  const camLinhas = [
    ["Helena Teste", `${cpfFake(11)} `, 1, 1, "PRESIDENCIA", "Enviado"],
    [null, null, 1, null, "PRESIDENCIA", "RESERVADO"],
    [null, null, 1, null, "PRESIDENCIA", "RESERVADO"],
    ["Igor Teste", n(12), 1, 1, "Lafetá", "Enviado"],
    ["Joana Teste", n(13), 1, 1, "Lafetá", "Enviado"],
    [null, n(14), 1, 1, "Rafinha", "Enviado"],
  ];
  camLinhas.forEach((l, i) => (cam.getRow(5 + i).values = l));

  const conv = wb.addWorksheet("Convidados Camarote");
  conv.getRow(2).values = [null, "Nome", "QT", "Convidade do:", "Indicação de:"];
  conv.getRow(3).values = [1, "Helena  Teste", 1, "PRESIDENCIA"];
  conv.getRow(4).values = [2, "Fora da Lista", 1, "Alguém"];

  const div = wb.addWorksheet("Divisão");
  div.getCell("D6").value = 44;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
