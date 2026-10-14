"use server";
import { revalidatePath } from "next/cache";
import { mascararCpf } from "@/lib/cpf";
import { lerErro, type Resultado } from "@/lib/erros";
import { aplicarPlano } from "@/lib/importacao/aplicar";
import { lerTabela, montarPedidos, type CampoForms } from "@/lib/importacao/forms";
import { lerPlanilha, type Aviso } from "@/lib/importacao/planilha";
import { deInputLocal } from "@/lib/formato";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";

const mascarar = (s: string) => s.replace(/\b\d{11}\b/g, (c) => mascararCpf(c));

async function rpcUsuario() {
  const supabase = await supabaseServidor();
  return {
    supabase,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw error;
      return data;
    },
  };
}

async function mapaAreas() {
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("areas").select("slug, id");
  return Object.fromEntries((data ?? []).map((a) => [a.slug, a.id])) as Record<string, string>;
}

export interface PreviaPlanilha {
  titulo: string;
  inicioSugerido: string;
  resumo: Record<string, number>;
  porArea: { setor: string; area: string; ingressos: number }[];
  vagas: number;
  camaroteDisponibilizados: number | null;
  avisos: Aviso[];
  eventoId?: string;
}

/** Planilha legada: sem "aplicar" só mostra a prévia; com "aplicar" grava. */
export async function importarPlanilha(_: unknown, form: FormData): Promise<Resultado<PreviaPlanilha>> {
  await exigirAdmin();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return { ok: false, erro: "Escolha o arquivo .xlsx." };
  try {
    const plano = await lerPlanilha(Buffer.from(await arquivo.arrayBuffer()));
    const ano = new Date().getFullYear();
    const inicioSugerido = plano.dia && plano.mes ? `${ano}-${String(plano.mes).padStart(2, "0")}-${String(plano.dia).padStart(2, "0")}T21:30` : "";
    const porArea = new Map<string, number>();
    for (const p of plano.pedidos) porArea.set(`${p.setor}|${p.areaSlug}`, (porArea.get(`${p.setor}|${p.areaSlug}`) ?? 0) + p.pessoas.length);
    const previa: PreviaPlanilha = {
      titulo: plano.titulo, inicioSugerido, resumo: plano.resumo,
      porArea: [...porArea].map(([k, n]) => ({ setor: k.split("|")[0], area: k.split("|")[1], ingressos: n })),
      vagas: plano.vagas.reduce((n, v) => n + v.qtd, 0),
      camaroteDisponibilizados: plano.camaroteDisponibilizados,
      avisos: plano.avisos.map((a) => ({ ...a, mensagem: mascarar(a.mensagem) })),
    };
    if (form.get("aplicar") !== "1") return { ok: true, dados: previa };

    const inicio = deInputLocal(form.get("inicio"));
    if (!inicio) return { ok: false, erro: "Informe a data e hora do evento." };
    const { supabase, rpc } = await rpcUsuario();
    const r = await aplicarPlano(plano, rpc, { inicio, areas: await mapaAreas(), competicao: String(form.get("competicao") ?? "") || undefined });
    await supabase.rpc("registrar_auditoria", { p_acao: "importar", p_entidade: "evento", p_entidade_id: r.eventoId, p_detalhes: { arquivo: arquivo.name, ingressos: r.ingressosCriados, vagas: r.vagasCriadas } });
    revalidatePath("/eventos");
    return {
      ok: true,
      mensagem: `Importado: ${r.ingressosCriados} ingressos e ${r.vagasCriadas} vagas reservadas.`,
      dados: { ...previa, eventoId: r.eventoId, avisos: [...previa.avisos, ...r.avisos.map((a) => ({ ...a, mensagem: mascarar(a.mensagem) }))] },
    };
  } catch (e) {
    return { ok: false, erro: lerErro(e).mensagem };
  }
}

export interface PreviaForms {
  cabecalhos: string[];
  amostra: string[][];
  total: number;
}

export async function lerForms(_: unknown, form: FormData): Promise<Resultado<PreviaForms>> {
  await exigirAdmin();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return { ok: false, erro: "Escolha o arquivo CSV ou XLSX exportado do Forms." };
  const t = await lerTabela(await arquivo.arrayBuffer(), arquivo.name);
  return { ok: true, dados: { cabecalhos: t.cabecalhos, amostra: t.linhas.slice(0, 3).map((l) => l.map((c) => mascarar(c))), total: t.linhas.length } };
}

export async function importarForms(form: FormData): Promise<Resultado<{ criados: number; erros: string[] }>> {
  await exigirAdmin();
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) return { ok: false, erro: "Arquivo ausente." };
  const evento = String(form.get("evento") ?? "");
  const setor = String(form.get("setor") ?? "arquibancada");
  const areaFixa = String(form.get("area_fixa") ?? "");
  const mapa = JSON.parse(String(form.get("mapa") ?? "{}")) as Partial<Record<CampoForms, number>>;
  if (!evento) return { ok: false, erro: "Escolha o evento." };
  const t = await lerTabela(await arquivo.arrayBuffer(), arquivo.name);
  const pedidos = montarPedidos(t, mapa);
  const areas = await mapaAreas();
  const { rpc } = await rpcUsuario();
  let criados = 0;
  const erros: string[] = [];
  for (const p of pedidos) {
    const area = areaFixa || (p.areaSlug ? areas[p.areaSlug] : undefined);
    if (!area) { erros.push(`Linha ${p.linha}: área "${p.areaTexto}" não reconhecida`); continue; }
    try {
      await rpc("criar_pedido", { p_evento: evento, p_setor: setor, p_area: area, p_pessoas: p.pessoas, p_opcoes: { origem: "forms", lista_espera: true, motivo: `importado do Forms (linha ${p.linha})` } });
      criados += p.pessoas.length;
    } catch (e) {
      erros.push(`Linha ${p.linha} (${p.pessoas[0]?.nome}): ${mascarar(lerErro(e).mensagem)}`);
    }
  }
  revalidatePath(`/eventos/${evento}`, "layout");
  return { ok: true, dados: { criados, erros }, mensagem: `${criados} ingresso(s) importados${erros.length ? `, ${erros.length} linha(s) com problema` : ""}.` };
}
