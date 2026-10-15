import Link from "next/link";
import { AoVivo } from "@/components/ao-vivo";
import { CabecalhoJogo } from "@/components/jogo";
import { CHAVE_ESCUDO_ATLETICO, chaveEscudoAdversario, imagensDisponiveis } from "@/lib/imagens";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { carregarEvento, carregarResumo } from "../dados";
import { carregarIngressos } from "../ingressos";
import { type Walkin } from "./camarote";
import { PainelJogo, type ConvitePendente, type LinhaPainel } from "./painel-jogo";
import { carregarAnfitrioes, opcoesAdicionar } from "../adicionar-opcoes";

export const metadata = { title: "Painel do jogo" };

export default async function Painel({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirStaff();
  const { id } = await params;
  const ev = await carregarEvento(id);
  const supabase = await supabaseServidor();
  const [{ setores, linhas: resumo }, linhas, { data: areas }] = await Promise.all([
    carregarResumo(id),
    carregarIngressos(id, ["convite_enviado", "aguardando_preenchimento", "solicitado", "validado_area", "aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado", "presente", "lista_espera"], "painel"),
    supabase.from("areas").select("id, nome, slug").eq("ativo", true).order("ordem"),
  ]);
  const [img, { data: walkins }, anfitrioes, { data: convites }] = await Promise.all([
    imagensDisponiveis(), supabase.rpc("lista_walkins", { p_evento: id }), carregarAnfitrioes(id),
    supabase.from("convites").select("id, token, nome_previsto, qtd_lugares, expira_em, setor, area_id, contato").eq("evento_id", id).eq("status", "aguardando").order("criado_em"),
  ]);
  const nomeArea = new Map((areas ?? []).map((a) => [a.id, a.nome]));
  const areaPadrao = (areas ?? []).find((a) => a.slug === "marketing")?.id ?? areas?.[0]?.id ?? "";

  return (
    <>
      <AoVivo evento={id} />
      <CabecalhoJogo ev={ev} voltar={s.papel === "admin" ? { href: `/eventos/${id}`, rotulo: "Gestão do evento" } : { href: "/eventos", rotulo: "Eventos" }} escudoAtletico={img[CHAVE_ESCUDO_ATLETICO]} escudoAdversario={img[chaveEscudoAdversario(id)]}>
        {s.papel === "admin" && <Link href={`/eventos/${id}`} className="mt-1 text-sm font-semibold text-white/80 underline hover:text-white">Gestão completa do evento</Link>}
      </CabecalhoJogo>
      <PainelJogo
        evento={id}
        linhas={linhas as unknown as LinhaPainel[]}
        setores={setores.map((x) => ({ setor: x.setor, capacidade: x.capacidade, ocupados: x.ocupados }))}
        areas={(areas ?? []).map(({ id, nome }) => ({ id, nome }))}
        areaPadrao={areaPadrao}
        walkins={(walkins ?? []) as Walkin[]}
        opcoes={opcoesAdicionar(setores, resumo, areas ?? [])}
        anfitrioes={anfitrioes}
        simples={s.papel === "marketing"}
        eventoInfo={{ titulo: ev.titulo, inicio: ev.inicio, abertura_portoes: ev.abertura_portoes }}
        convites={((convites ?? []) as Omit<ConvitePendente, "area_nome">[]).map((c) => ({ ...c, area_nome: nomeArea.get(c.area_id) ?? "" }))}
      />
    </>
  );
}
