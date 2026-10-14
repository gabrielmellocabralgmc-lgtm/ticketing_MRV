// Leitura da planilha legada "MRV_TicketManagement_<jogo>.xlsx" (abas Arquibancada, Camarote,
// Convidados Camarote, Divisão) e conversão em um plano de importação revisável.
// Nada aqui toca no banco: ver aplicar.ts.
import ExcelJS from "exceljs";
import { cpfValido, normalizarCpf } from "@/lib/cpf";
import { limparNome, normalizarTexto } from "@/lib/texto";

export type StatusImportado = "solicitado" | "aprovado" | "facial_pendente" | "enviado" | "cancelado";

export interface PessoaPlano {
  nome: string;
  cpf: string | null;
  status: StatusImportado;
  observacao?: string;
}

export interface PedidoPlano {
  setor: "arquibancada" | "camarote";
  areaSlug: string;
  pessoas: PessoaPlano[];
  indicacaoDe?: string;
  linha: string; // ex.: "Arquibancada!10"
}

export interface VagaPlano {
  setor: "camarote";
  areaSlug: string;
  qtd: number;
  nomePrevisto: string;
  linhas: string[];
}

export interface Aviso {
  tipo: "erro" | "alerta" | "info";
  linha?: string;
  mensagem: string;
}

export interface PlanoImportacao {
  titulo: string;
  adversario: string | null;
  dia: number | null;
  mes: number | null;
  camaroteDisponibilizados: number | null;
  pedidos: PedidoPlano[];
  vagas: VagaPlano[];
  convidadosCamarote: { nome: string; convidadoDo: string | null; encontrado: boolean }[];
  avisos: Aviso[];
  resumo: Record<string, number>;
}

// Variações de nome de área vistas nas planilhas → slug cadastrado
const AREAS: [RegExp, string][] = [
  [/^comercial corp/, "comercial-corporativo"],
  [/^comercial (regional )?bh/, "comercial-regional-bh"],
  [/^comercial$/, "comercial"],
  [/^dh$/, "dh"],
  [/^marketing/, "marketing"],
  [/^di$/, "di"],
  [/^producao/, "producao"],
  [/^luggo/, "luggo"],
  [/^urba/, "urba"],
  [/^rel(acionamento)? institucional/, "rel-institucional"],
  [/^presidencia/, "presidencia"],
];

export function areaParaSlug(nome: string): string | null {
  const n = normalizarTexto(nome);
  for (const [re, slug] of AREAS) if (re.test(n)) return slug;
  return null;
}

/** Valor "útil" de uma célula do exceljs (resultado de fórmula, rich text, hyperlink…). */
export function valorCelula(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) {
      const r = v.result;
      if (r === undefined || r === null || (typeof r === "object" && "error" in r)) return null;
      return valorCelula(r as ExcelJS.CellValue);
    }
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
  }
  return String(v);
}

function aba(wb: ExcelJS.Workbook, nome: string) {
  const alvo = normalizarTexto(nome);
  return wb.worksheets.find((w) => normalizarTexto(w.name) === alvo);
}

function linhas(ws: ExcelJS.Worksheet, inicio: number) {
  const out: { n: number; c: (i: number) => string | number | null }[] = [];
  for (let n = inicio; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    out.push({ n, c: (i: number) => valorCelula(row.getCell(i).value) });
  }
  return out;
}

const texto = (v: string | number | null) => (v === null ? "" : String(v));
const numero = (v: string | number | null) => (typeof v === "number" ? v : Number(texto(v).replace(",", ".")) || 0);

function lerCpf(v: string | number | null, linha: string, quem: string, avisos: Aviso[]): string | null {
  if (v === null || texto(v).trim() === "") return null;
  const cpf = normalizarCpf(v);
  if (!cpf || !cpfValido(cpf)) {
    avisos.push({ tipo: "erro", linha, mensagem: `CPF inválido para ${quem}: "${texto(v).trim()}" — linha ignorada` });
    return "INVALIDO";
  }
  return cpf;
}

/** Status legado (Enviado/ENVIADO/PENDENTE/pendente/vazio) + contagens → status do sistema por lugar. */
function statusDosLugares(statusBruto: string, reservados: number, enviados: number, obs: string, lugares: number): StatusImportado[] {
  const s = normalizarTexto(statusBruto);
  const semCadastro = /sem cadastro/.test(normalizarTexto(obs));
  const pendente: StatusImportado = semCadastro ? "facial_pendente" : "aprovado";
  return Array.from({ length: lugares }, (_, i) => {
    if (s === "enviado") return enviados > 0 && i >= enviados ? pendente : "enviado";
    if (i < enviados) return "enviado";
    if (s === "pendente" || s === "reservado" || reservados > 0) return pendente;
    return "solicitado";
  });
}

export async function lerPlanilha(arquivo: ArrayBuffer | Buffer): Promise<PlanoImportacao> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arquivo as ArrayBuffer);
  const avisos: Aviso[] = [];
  const pedidos: PedidoPlano[] = [];
  const vagas: VagaPlano[] = [];
  const resumo: Record<string, number> = {};
  const conta = (k: string, n = 1) => (resumo[k] = (resumo[k] ?? 0) + n);

  const arq = aba(wb, "Arquibancada");
  const cam = aba(wb, "Camarote");
  const conv = aba(wb, "Convidados Camarote");
  const div = aba(wb, "Divisão");
  if (!arq && !cam) throw new Error("A planilha não tem as abas Arquibancada/Camarote no formato esperado.");

  // Título "Galo vs Montevideo (14.10)" na linha 2
  const tituloBruto = texto(valorCelula((arq ?? cam)!.getCell("A2").value)).trim();
  const m = tituloBruto.match(/^(.*?)\s*\((\d{1,2})[./](\d{1,2})\)\s*$/);
  const titulo = (m ? m[1] : tituloBruto).replace(/\s+vs\.?\s+/i, " × ").trim() || "Evento importado";
  const adversario = titulo.includes("×") ? titulo.split("×")[1].trim() : null;

  // ---------------------------------------------------------- Arquibancada
  if (arq) {
    for (const { n, c } of linhas(arq, 5)) {
      const linha = `Arquibancada!${n}`;
      const areaBruta = texto(c(1));
      const nome = limparNome(texto(c(2)));
      const cpfBruto = c(4);
      const cpfConvBruto = c(5);
      if (!areaBruta.trim()) continue;
      if (!nome && !texto(cpfBruto).trim()) continue; // vaga em branco da planilha
      const areaSlug = areaParaSlug(areaBruta);
      if (!areaSlug) {
        avisos.push({ tipo: "erro", linha, mensagem: `Área desconhecida: "${areaBruta.trim()}"` });
        continue;
      }
      const statusBruto = texto(c(9));
      const obs = texto(c(10)).trim();
      if (!texto(cpfBruto).trim()) {
        conta("arquibancada_sem_solicitacao");
        avisos.push({ tipo: "info", linha, mensagem: `${nome} (${areaBruta.trim()}) não preencheu o formulário${obs ? ` — ${obs}` : ""}: não importado` });
        continue;
      }
      const cpf = lerCpf(cpfBruto, linha, nome ?? "titular", avisos);
      const cpfConv = lerCpf(cpfConvBruto, linha, `convidado de ${nome ?? "?"}`, avisos);
      if (cpf === "INVALIDO" || cpfConv === "INVALIDO") continue;
      const lugares = cpfConv ? 2 : 1;
      const reservados = numero(c(7));
      const enviados = numero(c(8));
      if (reservados && reservados !== lugares) {
        avisos.push({ tipo: "alerta", linha, mensagem: `RESERVADOS=${reservados}, mas a linha tem ${lugares} CPF(s)` });
      }
      const st = statusDosLugares(statusBruto, reservados, enviados, obs, lugares);
      const nomeTitular = nome ?? "(sem nome)";
      if (!nome) avisos.push({ tipo: "alerta", linha, mensagem: `CPF sem nome (${areaBruta.trim()})${obs ? ` — ${obs}` : ""}` });
      const ehRelInst = areaSlug === "rel-institucional";
      const pessoas: PessoaPlano[] = [{ nome: nomeTitular, cpf, status: st[0], observacao: !ehRelInst && obs ? obs : undefined }];
      if (cpfConv) pessoas.push({ nome: `Convidado de ${nomeTitular}`, cpf: cpfConv, status: st[1] });
      pedidos.push({ setor: "arquibancada", areaSlug, pessoas, indicacaoDe: ehRelInst && obs ? obs : undefined, linha });
      conta("arquibancada_ingressos", lugares);
      if (cpfConv) conta("convidados_sem_nome");
    }
    const totReservados = numero(valorCelula(arq.getCell("G3").value));
    const totEnviados = numero(valorCelula(arq.getCell("H3").value));
    if (totReservados && totEnviados > totReservados) {
      avisos.push({ tipo: "alerta", linha: "Arquibancada!G3:H3", mensagem: `Totais da planilha não fecham: ${totReservados} reservados × ${totEnviados} enviados` });
    }
  }

  // ---------------------------------------------------------- Camarote
  const nomesCamarote = new Set<string>();
  if (cam) {
    // Agrupa linhas consecutivas com a mesma INDICAÇÃO em um pedido
    let atual: { chave: string; pedido?: PedidoPlano; vaga?: VagaPlano } | null = null;
    for (const { n, c } of linhas(cam, 5)) {
      const linha = `Camarote!${n}`;
      const nome = limparNome(texto(c(1)));
      const cpfBruto = c(2);
      const reservados = numero(c(3));
      const enviados = numero(c(4));
      const indicacao = limparNome(texto(c(5)));
      const statusBruto = texto(c(6));
      const obs = texto(c(7)).trim();
      if (!nome && !texto(cpfBruto).trim() && !indicacao) continue;
      const indicacaoDe = indicacao ?? "Sem indicação";
      const areaSlug = /^presidencia$/.test(normalizarTexto(indicacaoDe)) ? "presidencia" : "marketing";

      if (!nome && !texto(cpfBruto).trim()) {
        // RESERVADO sem dados = vaga guardada (vira convite do Modo B)
        if (atual?.vaga && atual.chave === indicacaoDe) {
          atual.vaga.qtd++;
          atual.vaga.linhas.push(linha);
        } else {
          const vaga: VagaPlano = { setor: "camarote", areaSlug, qtd: 1, nomePrevisto: indicacaoDe, linhas: [linha] };
          vagas.push(vaga);
          atual = { chave: indicacaoDe, vaga };
        }
        conta("camarote_vagas_reservadas");
        continue;
      }
      const cpf = lerCpf(cpfBruto, linha, nome ?? "convidado do camarote", avisos);
      if (cpf === "INVALIDO") continue;
      if (!nome) avisos.push({ tipo: "alerta", linha, mensagem: `Camarote: CPF sem nome (indicação ${indicacaoDe})` });
      if (!cpf) avisos.push({ tipo: "alerta", linha, mensagem: `Camarote: ${nome} sem CPF` });
      const [status] = statusDosLugares(statusBruto, reservados, enviados, obs, 1);
      const p: PessoaPlano = { nome: nome ?? "(sem nome)", cpf, status, observacao: obs || undefined };
      if (nome) nomesCamarote.add(normalizarTexto(nome));
      if (atual?.pedido && atual.chave === indicacaoDe) {
        atual.pedido.pessoas.push(p);
      } else {
        const pedido: PedidoPlano = { setor: "camarote", areaSlug, pessoas: [p], indicacaoDe, linha };
        pedidos.push(pedido);
        atual = { chave: indicacaoDe, pedido };
      }
      conta("camarote_ingressos");
    }
    if (pedidos.some((p) => p.setor === "camarote")) {
      avisos.push({
        tipo: "info",
        mensagem: "Camarote: a planilha não indica a área MRV nem o anfitrião. Pedidos com indicação PRESIDENCIA foram para Presidência; os demais, para Marketing, com a indicação preservada.",
      });
    }
  }

  // ---------------------------------------------------------- Convidados Camarote (lista paralela, sem CPF)
  const convidadosCamarote: PlanoImportacao["convidadosCamarote"] = [];
  if (conv) {
    for (const { n, c } of linhas(conv, 3)) {
      const nome = limparNome(texto(c(2)));
      if (!nome) continue;
      const convidadoDo = limparNome(texto(c(4)));
      const encontrado = nomesCamarote.has(normalizarTexto(nome));
      convidadosCamarote.push({ nome, convidadoDo, encontrado });
      if (!encontrado) {
        conta("convidados_camarote_sem_correspondencia");
        avisos.push({ tipo: "alerta", linha: `Convidados Camarote!${n}`, mensagem: `${nome} (convidado de ${convidadoDo ?? "?"}) não aparece na aba Camarote` });
      }
    }
  }

  // ---------------------------------------------------------- Divisão
  let camaroteDisponibilizados: number | null = null;
  if (div) {
    const v = valorCelula(div.getCell("D6").value);
    camaroteDisponibilizados = typeof v === "number" ? v : null;
  }

  // CPFs repetidos dentro da própria planilha
  const vistos = new Map<string, string>();
  for (const p of pedidos) {
    for (const pe of p.pessoas) {
      if (!pe.cpf) continue;
      const ant = vistos.get(pe.cpf);
      if (ant) avisos.push({ tipo: "erro", linha: p.linha, mensagem: `CPF de ${pe.nome} repetido (já aparece em ${ant})` });
      else vistos.set(pe.cpf, p.linha);
    }
  }

  return {
    titulo, adversario,
    dia: m ? Number(m[2]) : null,
    mes: m ? Number(m[3]) : null,
    camaroteDisponibilizados, pedidos, vagas, convidadosCamarote, avisos, resumo,
  };
}
