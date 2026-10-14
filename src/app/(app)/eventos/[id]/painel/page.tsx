import Link from "next/link";
import { AoVivo } from "@/components/ao-vivo";
import { CabecalhoJogo } from "@/components/jogo";
import { CHAVE_ESCUDO_ATLETICO, chaveEscudoAdversario, imagensDisponiveis } from "@/lib/imagens";
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
  const img = await imagensDisponiveis();
  const areaPadrao = (areas ?? []).find((a) => a.slug === "marketing")?.id ?? areas?.[0]?.id ?? "";

  return (
    <>
      <AoVivo evento={id} />
      <CabecalhoJogo ev={ev} escudoAtletico={img[CHAVE_ESCUDO_ATLETICO]} escudoAdversario={img[chaveEscudoAdversario(id)]}>
        {s.papel === "admin" && <Link href={`/eventos/${id}`} className="mt-1 text-sm font-semibold text-white/80 underline hover:text-white">Gestão completa do evento</Link>}
      </CabecalhoJogo>
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
