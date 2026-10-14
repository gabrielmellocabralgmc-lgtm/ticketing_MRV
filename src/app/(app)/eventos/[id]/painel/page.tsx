import Link from "next/link";
import { AoVivo } from "@/components/ao-vivo";
import { Titulo } from "@/components/ui";
import { dataLonga } from "@/lib/formato";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { carregarEvento, carregarResumo } from "../dados";
import { carregarIngressos } from "../ingressos";
import { PainelJogo, type LinhaPainel } from "./painel-jogo";

export const metadata = { title: "Painel do jogo" };

export default async function Painel({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirStaff();
  const { id } = await params;
  const ev = await carregarEvento(id);
  const supabase = await supabaseServidor();
  const [{ setores }, linhas, { data: areas }] = await Promise.all([
    carregarResumo(id),
    carregarIngressos(id, ["solicitado", "validado_area", "aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado", "presente", "lista_espera"], "painel"),
    supabase.from("areas").select("id, nome, slug").eq("ativo", true).order("ordem"),
  ]);
  const areaPadrao = (areas ?? []).find((a) => a.slug === "marketing")?.id ?? areas?.[0]?.id ?? "";

  return (
    <>
      <AoVivo evento={id} />
      {s.papel === "admin" && <div className="mb-2 text-sm"><Link href={`/eventos/${id}`} className="text-mrv-700 hover:underline">← gestão completa do evento</Link></div>}
      <Titulo sub={<span className="first-letter:uppercase">{dataLonga(ev.inicio)}{ev.competicao && ` · ${ev.competicao}`}</span>}>{ev.titulo}</Titulo>
      <PainelJogo
        evento={id}
        linhas={linhas as unknown as LinhaPainel[]}
        setores={setores.map((x) => ({ setor: x.setor, capacidade: x.capacidade, ocupados: x.ocupados }))}
        areas={(areas ?? []).map(({ id, nome }) => ({ id, nome }))}
        areaPadrao={areaPadrao}
      />
    </>
  );
}
