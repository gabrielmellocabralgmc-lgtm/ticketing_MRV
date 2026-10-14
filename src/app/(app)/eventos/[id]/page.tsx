import Link from "next/link";
import { BotaoAcao, FormAcao } from "@/components/form-acao";
import { AoVivo } from "@/components/ao-vivo";
import { BotaoLink, Campo, Cartao, Entrada, Numero, Selecao, Selo, Tabela, Titulo, Vazio } from "@/components/ui";
import { dataHora, dataLonga } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROTULO_SETOR, ROTULO_STATUS_EVENTO } from "@/lib/tipos";
import { ajustarCota, mudarStatusEvento, remanejarCota } from "../actions";
import { carregarEvento, carregarResumo } from "./dados";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: (await carregarEvento(id)).titulo };
}

export default async function PaginaEvento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await exigirSessao();
  const ev = await carregarEvento(id);
  const { linhas, setores } = await carregarResumo(id);
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
      <Titulo
        sub={<span className="first-letter:uppercase">{dataLonga(ev.inicio)}{ev.competicao && ` · ${ev.competicao}`}{ev.abertura_portoes && ` · portões ${dataHora(ev.abertura_portoes)}`}</span>}
        acoes={
          s.staff && (
            <>
              <BotaoLink href={`/eventos/${id}/aprovacao`} variante="primario">Aprovação{pendenteAprovar > 0 && ` (${pendenteAprovar})`}</BotaoLink>
              <BotaoLink href={`/eventos/${id}/envio`}>A enviar{aEnviar > 0 && ` (${aEnviar})`}</BotaoLink>
              <a href={`/eventos/${id}/exportar`} className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-semibold text-mrv-700 ring-1 ring-mrv-700/30 hover:bg-mrv-50">Exportar XLSX</a>
              <BotaoLink href={`/eventos/${id}/editar`} variante="fantasma">Editar</BotaoLink>
            </>
          )
        }
      >
        {ev.titulo}{" "}
        <Selo tom={ev.status === "aberto" ? "verde" : ev.status === "rascunho" ? "amarelo" : "cinza"}>{ROTULO_STATUS_EVENTO[ev.status]}</Selo>
        {ev.concorrido && <> <Selo tom="laranja">Concorrido</Selo></>}
      </Titulo>

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
            {ev.status === "fechado" && <BotaoAcao acao={mudarStatusEvento.bind(null, id, "realizado")} rotulo="Marcar como realizado" />}
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
              {st.cota_por_area && <Numero rotulo="Pool (não alocado)" valor={pool} tom={pool > 0 ? "laranja" : "cinza"} />}
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
          </Cartao>
        );
      })}

      {s.staff && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Cartao>
            <h2 className="mb-3 font-bold text-mrv-900">Ajustar cota</h2>
            <FormAcao acao={ajustarCota.bind(null, id)} rotulo="Salvar cota">
              <SeletorSetorArea setores={setores.map((x) => x.setor)} linhas={linhas} incluirCapacidade />
              <Campo rotulo="Nova quantidade"><Entrada name="quantidade" type="number" min={0} required /></Campo>
              <Campo rotulo="Motivo"><Entrada name="motivo" required placeholder="ex.: 4 extras liberados pelo Atlético" /></Campo>
            </FormAcao>
          </Cartao>
          <Cartao>
            <h2 className="mb-3 font-bold text-mrv-900">Remanejar saldo</h2>
            <FormAcao acao={remanejarCota.bind(null, id)} rotulo="Remanejar">
              <Campo rotulo="Setor">
                <Selecao name="setor">{setores.filter((x) => x.cota_por_area).map((x) => <option key={x.setor} value={x.setor}>{ROTULO_SETOR[x.setor]}</option>)}</Selecao>
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="De"><Selecao name="de">{areasUnicas(linhas).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Selecao></Campo>
                <Campo rotulo="Para"><Selecao name="para">{areasUnicas(linhas).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</Selecao></Campo>
              </div>
              <Campo rotulo="Quantidade"><Entrada name="quantidade" type="number" min={1} required /></Campo>
              <Campo rotulo="Motivo"><Entrada name="motivo" required /></Campo>
            </FormAcao>
          </Cartao>
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

function areasUnicas(linhas: { area_id: string; area_nome: string }[]) {
  const m = new Map<string, string>();
  for (const l of linhas) m.set(l.area_id, l.area_nome);
  return [...m].map(([id, nome]) => ({ id, nome }));
}

async function SeletorSetorArea({ setores, linhas, incluirCapacidade }: { setores: string[]; linhas: { area_id: string; area_nome: string }[]; incluirCapacidade?: boolean }) {
  const supabase = await supabaseServidor();
  const { data: todas } = await supabase.from("areas").select("id, nome").eq("ativo", true).order("ordem");
  const areas = todas ?? areasUnicas(linhas);
  return (
    <>
      <Campo rotulo="Setor">
        <Selecao name="setor">{setores.map((x) => <option key={x} value={x}>{ROTULO_SETOR[x as keyof typeof ROTULO_SETOR]}</option>)}</Selecao>
      </Campo>
      <Campo rotulo="Área">
        <Selecao name="area">
          {incluirCapacidade && <option value="">— Capacidade total do setor —</option>}
          {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </Selecao>
      </Campo>
    </>
  );
}
