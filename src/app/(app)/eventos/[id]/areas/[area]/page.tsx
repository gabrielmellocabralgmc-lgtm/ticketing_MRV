import Link from "next/link";
import { notFound } from "next/navigation";
import { AoVivo } from "@/components/ao-vivo";
import { BotaoAcao } from "@/components/form-acao";
import { CabecalhoJogo } from "@/components/jogo";
import { Aviso, Cartao, Numero } from "@/components/ui";
import { CHAVE_ESCUDO_ATLETICO, chaveEscudoAdversario, imagensDisponiveis } from "@/lib/imagens";
import { dataHora, paraInputLocal } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROTULO_SETOR, type Saldo, type Setor } from "@/lib/tipos";
import { carregarEvento } from "../../dados";
import { validarLista } from "./actions";
import { FormConvite } from "./form-convite";
import { FormSolicitacao } from "./form-solicitacao";
import { ListaArea, type LinhaLista } from "./lista";

export const metadata = { title: "Lista da área" };

export default async function PainelArea({ params, searchParams }: { params: Promise<{ id: string; area: string }>; searchParams: Promise<{ setor?: string }> }) {
  const [{ id, area }, { setor: setorParam }] = await Promise.all([params, searchParams]);
  const s = await exigirSessao();
  const ev = await carregarEvento(id);
  const supabase = await supabaseServidor();
  const img = await imagensDisponiveis();

  const [{ data: areaRow }, { data: setoresRows }] = await Promise.all([
    supabase.from("areas").select("id, nome").eq("id", area).maybeSingle(),
    supabase.from("evento_setores").select("setor").eq("evento_id", id),
  ]);
  if (!areaRow) notFound();
  // Camarote: pedidos passam pelo Marketing (o responsável não lança direto)
  const setores = (setoresRows ?? []).map((r) => r.setor as Setor).filter((x) => s.staff || x !== "camarote");
  if (!setores.length) notFound();
  const setor = (setorParam && setores.includes(setorParam as Setor) ? setorParam : setores.find((x) => x !== "camarote") ?? setores[0]) as Setor;

  const [{ data: saldoRows }, { data: linhas, error }, { data: validacao }] = await Promise.all([
    supabase.rpc("saldo", { p_evento: id, p_setor: setor, p_area: area }),
    supabase.rpc("lista_area", { p_evento: id, p_setor: setor, p_area: area }),
    supabase.from("validacoes").select("em, qtd, perfis:validado_por(nome)").eq("evento_id", id).eq("setor", setor).eq("area_id", area).order("em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (error) {
    return <Aviso tom="erro">Você não tem acesso à lista desta área.</Aviso>;
  }
  const saldo = (saldoRows as Saldo[] | null)?.[0];
  const lista = (linhas ?? []) as LinhaLista[];
  const aValidar = lista.filter((l) => l.status === "solicitado").length;
  const prazoPassou = !!ev.prazo_solicitacao && new Date(ev.prazo_solicitacao) < new Date();
  const camarote = setor === "camarote";
  const podeSolicitar = s.staff || (ev.status === "aberto" && !prazoPassou && !camarote);
  const eventoInfo = { titulo: ev.titulo, inicio: ev.inicio, abertura_portoes: ev.abertura_portoes };

  return (
    <>
      <AoVivo evento={id} />
      <CabecalhoJogo ev={ev} tamanho="m" escudoAtletico={img[CHAVE_ESCUDO_ATLETICO]} escudoAdversario={img[chaveEscudoAdversario(id)]}
        rotulo={`${areaRow.nome} · ${ROTULO_SETOR[setor]}`}>
        <div className="text-sm text-white/70">Solicitar até {dataHora(ev.prazo_solicitacao)} · validar até {dataHora(ev.prazo_validacao)}</div>
      </CabecalhoJogo>

      {setores.length > 1 && (
        <div className="mb-4 flex gap-2">
          {setores.map((x) => (
            <Link key={x} href={`?setor=${x}`} className={`rounded-full px-3 py-1 text-sm font-medium ${x === setor ? "bg-mrv-700 text-white" : "bg-white text-mrv-700 ring-1 ring-mrv-700/20"}`}>
              {ROTULO_SETOR[x]}
            </Link>
          ))}
        </div>
      )}

      {saldo && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* responsável vê só a cota da área; o total do setor é só para Admin/Marketing */}
          <Numero rotulo={saldo.cota !== null || !s.staff ? "Cota da área" : "Vagas do setor"} valor={saldo.cota ?? (s.staff ? saldo.capacidade : 0)} />
          <Numero rotulo="Usados" valor={saldo.cota !== null || !s.staff ? saldo.ocupados_area : saldo.ocupados_setor} tom="cinza" />
          <Numero rotulo="Saldo" valor={saldo.saldo} tom={saldo.saldo === 0 ? "laranja" : "mrv"} />
          <Numero rotulo="Lista de espera" valor={saldo.em_espera} tom={saldo.em_espera ? "laranja" : "cinza"} />
        </div>
      )}

      {camarote && (
        <div className="mb-6">
          <Aviso tom="alerta">
            Camarote é corporativo: quem pede precisa estar presente. Coloque o <b>anfitrião (colaborador MRV) como titular</b> e os convidados abaixo dele.
            Família ou amigos sem o anfitrião? Peça arquibancada. A central completa do camarote (prioridade, catering) entra na fase 2.
          </Aviso>
        </div>
      )}

      {!podeSolicitar && (
        <div className="mb-6"><Aviso tom="info">{ev.status !== "aberto" ? "O evento não está aberto para solicitações." : "O prazo de solicitação terminou."} Fale com o Marketing MRV para ajustes.</Aviso></div>
      )}

      {podeSolicitar && (
        <div className="mb-6 grid gap-6 xl:grid-cols-2">
          <Cartao>
            <h2 className="font-bold text-mrv-900">Modo A · eu preencho</h2>
            <p className="mb-4 text-sm text-tinta/60">Digite os dados de cada pessoa (padrão: colaborador + 1 convidado).</p>
            <FormSolicitacao evento={id} setor={setor} area={area} saldo={saldo?.saldo ?? 0} padraoConvidados={camarote ? 0 : 1} />
          </Cartao>
          <Cartao>
            <h2 className="font-bold text-mrv-900">Modo B · o convidado preenche</h2>
            <p className="mb-4 text-sm text-tinta/60">
              Reserve vagas e mande o link. A vaga conta na cota desde já; se não for preenchida até a validade, volta para o saldo.
            </p>
            <FormConvite evento={id} setor={setor} area={area} areaNome={areaRow.nome} eventoInfo={eventoInfo} saldo={saldo?.saldo ?? 0}
              maxValidade={paraInputLocal(ev.prazo_solicitacao)} />
          </Cartao>
        </div>
      )}

      <Cartao>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-mrv-900">Lista da área</h2>
            <p className="text-sm text-tinta/60">
              {validacao ? <>Última validação: {dataHora(validacao.em)} por {(validacao.perfis as unknown as { nome: string } | null)?.nome ?? "—"} ({validacao.qtd})</> : "A lista ainda não foi validada."}
              {!s.staff && " CPFs aparecem mascarados."}
            </p>
          </div>
          {aValidar > 0 && (
            <BotaoAcao acao={validarLista.bind(null, id, setor, area)} rotulo={`Validar lista (${aValidar})`} variante="primario"
              confirmar={`Confirmar os ${aValidar} ingresso(s) solicitados e enviar para a aprovação do Marketing?`} />
          )}
        </div>
        <ListaArea evento={id} setor={setor} area={area} areaNome={areaRow.nome} linhas={lista} eventoInfo={eventoInfo} />
      </Cartao>
    </>
  );
}
