import Link from "next/link";
import { redirect } from "next/navigation";
import { BotaoAcao } from "@/components/form-acao";
import { AoVivo } from "@/components/ao-vivo";
import { BotaoLink, Cartao, Numero, Selo, Tabela, Vazio } from "@/components/ui";
import { dataHora } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROTULO_SETOR, ROTULO_STATUS_EVENTO } from "@/lib/tipos";
import { CabecalhoJogo } from "@/components/jogo";
import { CHAVE_ESCUDO_ATLETICO, chaveEscudoAdversario, imagensDisponiveis } from "@/lib/imagens";
import { mudarStatusEvento } from "../actions";
import { EditorCotas } from "./editor-cotas";
import { encerrarEvento } from "./painel/actions";
import { Convocacao } from "./convocacao";
import { areasParaConvocar, envioReal } from "@/lib/mensagens/envio";
import { carregarEvento, carregarResumo, type LinhaResumo } from "./dados";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: (await carregarEvento(id)).titulo };
}

export default async function PaginaEvento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await exigirSessao();
  if (s.papel === "marketing") redirect(`/eventos/${id}/painel`);
  if (s.papel === "operacao") redirect(`/operacao?evento=${id}`);
  const ev = await carregarEvento(id);
  const { linhas, setores } = await carregarResumo(id);
  const img = await imagensDisponiveis();
  const { data: areasAtivas } = await (await supabaseServidor()).from("areas").select("id, nome").eq("ativo", true).order("ordem");
  if (s.papel === "responsavel") {
    const minhas = linhas.filter((l) => l.cota !== null);
    // uma área só: vai direto para a lista dela
    if (minhas.length === 1) redirect(`/eventos/${id}/areas/${minhas[0].area_id}?setor=${minhas[0].setor}`);
    return (
      <>
        <CabecalhoJogo ev={ev} tamanho="m" escudoAtletico={img[CHAVE_ESCUDO_ATLETICO]} escudoAdversario={img[chaveEscudoAdversario(id)]} />
        <VisaoResponsavel id={id} linhas={minhas} />
      </>
    );
  }
  const supabase = await supabaseServidor();
  const { data: historico } = s.staff
    ? await supabase.from("cotas_historico").select("id, setor, area_id, de, para, motivo, em, areas(nome)").eq("evento_id", id).order("id", { ascending: false }).limit(15)
    : { data: [] };

  const pendenteValidar = linhas.reduce((n, l) => n + l.solicitados, 0);
  const pendenteAprovar = linhas.reduce((n, l) => n + l.validados, 0);
  const aEnviar = linhas.reduce((n, l) => n + l.facial_ok, 0);

  return (
    <>
      <AoVivo evento={id} />
      <CabecalhoJogo ev={ev} tamanho="m" escudoAtletico={img[CHAVE_ESCUDO_ATLETICO]} escudoAdversario={img[chaveEscudoAdversario(id)]}>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Selo tom={ev.status === "aberto" ? "verde" : ev.status === "rascunho" ? "amarelo" : "cinza"}>{ROTULO_STATUS_EVENTO[ev.status]}</Selo>
          {ev.concorrido && <Selo tom="laranja">Concorrido</Selo>}
          {!img[chaveEscudoAdversario(id)] && <Link href={`/eventos/${id}/editar#escudos`} className="text-xs font-semibold text-white/80 underline hover:text-white">enviar escudo do adversário</Link>}
        </div>
      </CabecalhoJogo>
      {s.staff && (
        <div className="mb-6 flex flex-wrap gap-2">
          <BotaoLink href={`/eventos/${id}/painel`} variante="primario">Painel do jogo</BotaoLink>
          <BotaoLink href={`/eventos/${id}/lista`}>Lista geral</BotaoLink>
          <BotaoLink href={`/eventos/${id}/aprovacao`}>Aprovação{pendenteAprovar > 0 && ` (${pendenteAprovar})`}</BotaoLink>
          <BotaoLink href={`/eventos/${id}/envio`}>A enviar{aEnviar > 0 && ` (${aEnviar})`}</BotaoLink>
          <a href={`/eventos/${id}/exportar`} className="inline-flex min-h-10 items-center rounded-lg px-4 py-2 text-sm font-bold text-mrv-700 ring-1 ring-mrv-600 hover:bg-mrv-50">Exportar XLSX</a>
          <BotaoLink href={`/eventos/${id}/relatorio`} variante="fantasma">Relatório</BotaoLink>
          <BotaoLink href={`/eventos/${id}/editar`} variante="fantasma">Editar</BotaoLink>
        </div>
      )}

      {s.staff && (
        <Cartao className="mb-6 flex flex-wrap items-center gap-4">
          <div className="text-sm text-tinta/70">
            Prazo de solicitação: <b>{dataHora(ev.prazo_solicitacao)}</b> · validação: <b>{dataHora(ev.prazo_validacao)}</b>
            {pendenteValidar > 0 && <> · <span className="text-amber-700">{pendenteValidar} aguardando validação das áreas</span></>}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {ev.status === "rascunho" && <BotaoAcao acao={mudarStatusEvento.bind(null, id, "aberto")} rotulo="Abrir para solicitações" variante="primario" />}
            {ev.status === "aberto" && (
              <BotaoAcao acao={mudarStatusEvento.bind(null, id, "fechado")} rotulo="Encerrar prazo" variante="laranja"
                confirmar="Encerrar o prazo? Áreas não poderão mais solicitar e o saldo não usado volta para o pool." />
            )}
            {ev.status === "fechado" && <BotaoAcao acao={mudarStatusEvento.bind(null, id, "aberto")} rotulo="Reabrir" />}
            {["aberto", "fechado"].includes(ev.status) && new Date(ev.inicio).getTime() < Date.now() && (
              <BotaoAcao acao={encerrarEvento.bind(null, id)} rotulo="Encerrar evento" variante="laranja"
                confirmar="Encerrar o evento? No camarote, quem não teve a chegada confirmada vira no-show." />
            )}
          </div>
        </Cartao>
      )}

      {setores.map((st) => {
        const doSetor = linhas.filter((l) => l.setor === st.setor);
        const pool = st.capacidade - st.alocado;
        return (
          <Cartao key={st.setor} className="mb-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold text-mrv-900">{ROTULO_SETOR[st.setor]}</h2>
              {!st.cota_por_area && <span className="text-xs text-tinta/60">Sem cota por área — controle pelas {st.capacidade} vagas{ev.concorrido ? " e fila por prioridade" : ""}</span>}
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Numero rotulo="Ocupados" valor={st.ocupados} de={st.capacidade} />
              <Numero rotulo="Disponíveis" valor={Math.max(0, st.capacidade - st.ocupados)} tom="cinza" />
              {/* pool só aparece quando sobra ingresso sem área (ex.: devolvido no fim do prazo) */}
              {st.cota_por_area && pool > 0 && <Numero rotulo="Livre para distribuir" valor={pool} tom="laranja" />}
              <Numero rotulo="Lista de espera" valor={st.em_espera} tom={st.em_espera ? "laranja" : "cinza"} />
            </div>
            {doSetor.length === 0 ? (
              <Vazio>Nenhuma área com cota ou pedido neste setor.</Vazio>
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <th>Área</th><th className="text-right">Cota</th><th className="text-right">Ocupados</th><th className="text-right">Saldo</th>
                    <th className="text-right">Convites</th><th className="text-right">A validar</th><th className="text-right">Validados</th>
                    <th className="text-right">Aprovados</th><th className="text-right">Enviados</th><th className="text-right">Espera</th><th />
                  </tr>
                </thead>
                <tbody className="tabular">
                  {doSetor.map((l) => {
                    const saldo = l.cota === null ? null : l.cota - l.ocupados;
                    const aprovados = l.aprovados + l.facial_pendente + l.facial_ok;
                    const enviados = l.enviados + l.confirmados + l.presentes + l.no_show;
                    return (
                      <tr key={l.area_id}>
                        <td className="font-medium">
                          {l.area_nome}
                          {l.sob_demanda && <span className="ml-1 text-xs text-tinta/50">(sob demanda)</span>}
                          {l.ultima_validacao && <div className="text-xs font-normal text-mrv-700">validada {dataHora(l.ultima_validacao)}</div>}
                        </td>
                        <td className="text-right">{l.cota ?? "—"}</td>
                        <td className="text-right">{l.ocupados}</td>
                        <td className={`text-right ${saldo === 0 ? "text-tinta/40" : ""}`}>{saldo ?? "—"}</td>
                        <td className="text-right">{l.convites_aguardando || ""}</td>
                        <td className={`text-right ${l.solicitados ? "font-semibold text-amber-700" : ""}`}>{l.solicitados || ""}</td>
                        <td className="text-right">{l.validados || ""}</td>
                        <td className="text-right">{aprovados || ""}</td>
                        <td className="text-right">{enviados || ""}</td>
                        <td className="text-right">{l.em_espera || ""}</td>
                        <td className="text-right">
                          <Link href={`/eventos/${id}/areas/${l.area_id}?setor=${st.setor}`} className="text-sm font-semibold whitespace-nowrap text-mrv-700 hover:underline">
                            Abrir lista →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabela>
            )}
            {s.staff && (
              <div className="mt-4">
                <EditorCotas evento={id} setor={st.setor} capacidade={st.capacidade} cotaPorArea={st.cota_por_area}
                  areas={(areasAtivas ?? []).map((a) => {
                    const l = doSetor.find((x) => x.area_id === a.id);
                    return { area_id: a.id, area_nome: a.nome, cota: l?.cota ?? 0, usados: l?.ocupados ?? 0 };
                  })} />
              </div>
            )}
          </Cartao>
        );
      })}

      {s.staff && (
        <Cartao className="mb-6">
          <h2 className="mb-1 text-lg font-bold">E-mails para as áreas</h2>
          <p className="mb-4 text-sm text-cinza">Convocação com a cota, os prazos e o link da lista de cada área. O texto se edita em E-mails › Modelos.</p>
          <Convocacao evento={id} areas={await areasParaConvocar(id)} envioReal={envioReal()} />
        </Cartao>
      )}

      {s.staff && (
        <div>
          <Cartao>
            <h2 className="mb-3 font-bold text-mrv-900">Histórico de cotas</h2>
            {(historico ?? []).length === 0 ? <Vazio>Sem alterações.</Vazio> : (
              <ul className="space-y-2 text-sm">
                {(historico ?? []).map((h) => (
                  <li key={h.id} className="border-b border-black/5 pb-2">
                    <div>
                      <b>{(h.areas as unknown as { nome: string } | null)?.nome ?? `Capacidade ${ROTULO_SETOR[h.setor as keyof typeof ROTULO_SETOR]}`}</b>{" "}
                      <span className="tabular">{h.de ?? "—"} → {h.para}</span>
                    </div>
                    <div className="text-xs text-tinta/60">{dataHora(h.em)} · {h.motivo ?? "sem motivo"}</div>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      )}
    </>
  );
}

/** Responsável de área: só as próprias cotas, sem os totais do setor. */
function VisaoResponsavel({ id, linhas: minhas }: { id: string; linhas: LinhaResumo[] }) {
  return (
    <>
      <h2 className="mb-4 text-xl font-bold">Suas áreas neste jogo</h2>
      {minhas.length === 0 ? (
        <Vazio>Suas áreas não têm cota neste evento.</Vazio>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {minhas.map((l) => (
            <Link key={`${l.setor}-${l.area_id}`} href={`/eventos/${id}/areas/${l.area_id}?setor=${l.setor}`}>
              <Cartao className="transition hover:ring-mrv-600/40">
                <h2 className="font-bold text-mrv-900">{l.area_nome} · {ROTULO_SETOR[l.setor]}</h2>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Numero rotulo="Sua cota" valor={l.cota ?? 0} />
                  <Numero rotulo="Usados" valor={l.ocupados} tom="cinza" />
                  <Numero rotulo="Saldo" valor={Math.max(0, (l.cota ?? 0) - l.ocupados)} tom={(l.cota ?? 0) - l.ocupados <= 0 ? "laranja" : "mrv"} />
                </div>
                {l.em_espera > 0 && <p className="mt-2 text-xs text-amber-700">{l.em_espera} na lista de espera</p>}
              </Cartao>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
