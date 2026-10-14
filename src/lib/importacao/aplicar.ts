// Aplica um PlanoImportacao no banco usando só as funções públicas (criar_evento, criar_pedido,
// criar_convite, ajustar_cota) — as mesmas regras de CPF/duplicidade da tela valem aqui.
import type { Aviso, PlanoImportacao } from "./planilha";

/** Chama uma função do banco com argumentos nomeados (supabase.rpc ou SQL direto). */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

export interface OpcoesAplicar {
  inicio: string; // ISO com fuso, ex.: 2026-10-14T21:30:00-03:00
  status?: "rascunho" | "aberto" | "fechado" | "realizado" | "encerrado";
  areas: Record<string, string>; // slug → id
  competicao?: string;
}

export interface ResultadoAplicar {
  eventoId: string;
  ingressosCriados: number;
  vagasCriadas: number;
  avisos: Aviso[];
}

function mensagemErro(e: unknown) {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
  return m.replace(/^ERROR:\s*/, "");
}

export async function aplicarPlano(plano: PlanoImportacao, rpc: Rpc, op: OpcoesAplicar): Promise<ResultadoAplicar> {
  const avisos: Aviso[] = [];
  const futuro = new Date(op.inicio).getTime() > Date.now();
  const eventoId = (await rpc("criar_evento", {
    p: {
      tipo: "jogo",
      titulo: plano.titulo,
      adversario: plano.adversario,
      competicao: op.competicao ?? null,
      inicio: op.inicio,
      status: op.status ?? (futuro ? "aberto" : "realizado"),
      observacoes: "Importado da planilha legada",
    },
  })) as string;

  // Capacidade do camarote lida da aba Divisão (se for igual ao padrão, o ajuste não muda nada nem gera histórico)
  if (plano.camaroteDisponibilizados) {
    await rpc("ajustar_cota", {
      p_evento: eventoId, p_setor: "camarote", p_area: null, p_quantidade: plano.camaroteDisponibilizados,
      p_motivo: `Importado da planilha: ${plano.camaroteDisponibilizados} disponibilizados`,
    });
  }

  let ingressosCriados = 0;
  for (const pedido of plano.pedidos) {
    const area = op.areas[pedido.areaSlug];
    if (!area) {
      avisos.push({ tipo: "erro", linha: pedido.linha, mensagem: `Área ${pedido.areaSlug} não cadastrada` });
      continue;
    }
    try {
      await rpc("criar_pedido", {
        p_evento: eventoId,
        p_setor: pedido.setor,
        p_area: area,
        p_pessoas: pedido.pessoas.map((p) => ({ nome: p.nome, cpf: p.cpf, status: p.status, observacao: p.observacao ?? null })),
        p_opcoes: { origem: "importacao", ignorar_cota: true, indicacao_de: pedido.indicacaoDe ?? null, motivo: `importado da planilha (${pedido.linha})` },
      });
      ingressosCriados += pedido.pessoas.length;
    } catch (e) {
      avisos.push({ tipo: "erro", linha: pedido.linha, mensagem: `Não importado: ${mensagemErro(e)}` });
    }
  }

  let vagasCriadas = 0;
  for (const vaga of plano.vagas) {
    if (!futuro) {
      avisos.push({ tipo: "info", linha: vaga.linhas.join(", "), mensagem: `${vaga.qtd} vaga(s) reservada(s) sem dados (${vaga.nomePrevisto}) ignoradas: evento já passou` });
      continue;
    }
    try {
      await rpc("criar_convite", {
        p_evento: eventoId, p_setor: vaga.setor, p_area: op.areas[vaga.areaSlug], p_qtd: vaga.qtd,
        p_nome_previsto: vaga.nomePrevisto, p_contato: null, p_expira_em: op.inicio,
      });
      vagasCriadas += vaga.qtd;
    } catch (e) {
      avisos.push({ tipo: "erro", linha: vaga.linhas.join(", "), mensagem: `Vaga não criada: ${mensagemErro(e)}` });
    }
  }

  return { eventoId, ingressosCriados, vagasCriadas, avisos };
}
