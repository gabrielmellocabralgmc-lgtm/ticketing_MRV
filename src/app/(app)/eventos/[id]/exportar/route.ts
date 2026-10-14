import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import { exportarEvento, type LinhaExport } from "@/lib/xlsx/exportar";
import type { Setor } from "@/lib/tipos";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServidor();
  const { data: staff } = await supabase.rpc("eh_staff");
  if (!staff) return new NextResponse("Sem permissão", { status: 403 });

  const [{ data: ev }, { data: linhas }, { data: setores }] = await Promise.all([
    supabase.from("eventos").select("titulo, inicio").eq("id", id).single(),
    supabase.from("v_ingressos")
      .select("id, pedido_id, setor, area_nome, area_ordem, status, nome, cpf, celular, convidado_de, convidado_de_nome, indicacao_de, preenchido_por, observacao, criado_em")
      .eq("evento_id", id).order("area_ordem").order("pedido_id").order("criado_em"),
    supabase.from("evento_setores").select("setor, capacidade").eq("evento_id", id),
  ]);
  if (!ev) return new NextResponse("Evento não encontrado", { status: 404 });

  const data = new Date(ev.inicio);
  const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }).format(data).replace("/", ".");
  const arquivo = await exportarEvento({
    titulo: ev.titulo, dataCurta,
    linhas: (linhas ?? []) as LinhaExport[],
    setores: (setores ?? []) as { setor: Setor; capacidade: number }[],
  });
  await supabase.rpc("registrar_auditoria", { p_acao: "exportar", p_entidade: "evento", p_entidade_id: id, p_detalhes: { formato: "xlsx", linhas: linhas?.length ?? 0 } });

  const nome = `MRV_TicketManagement_${ev.titulo.replace(/[^\p{L}\p{N}]+/gu, "")}_${dataCurta}.xlsx`;
  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(nome)}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "no-store",
    },
  });
}
