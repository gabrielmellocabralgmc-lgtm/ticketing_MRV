"use client";
import { useState, useTransition } from "react";
import { BotaoCopiar, BotaoWhatsApp } from "@/components/copiar";
import { Aviso, Botao, Cartao, Entrada, Selo, SeloStatus, Tabela, Vazio } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { celular, dataHora } from "@/lib/formato";
import { linkTorcedor, linkWhatsApp, textoConvite, textoGaloId } from "@/lib/mensagens";
import type { Setor, StatusIngresso } from "@/lib/tipos";
import { cancelarConvite, cancelarIngresso, editarPessoa, validarIngresso } from "./actions";
import { DefinirAnfitriao, type PessoaDaLista } from "../../adicionar-convidado";
import { definirConvidadoDe, definirConvidadoDeVarios } from "../../adicionar-actions";

export interface LinhaLista {
  ingresso_id: string;
  pedido_id: string;
  convite_id: string | null;
  status: StatusIngresso;
  preenchido_por: string | null;
  nome: string | null;
  cpf: string | null;
  celular: string | null;
  email: string | null;
  convidado_de_nome: string | null;
  titular: boolean;
  token: string;
  criado_em: string;
  convite_nome_previsto: string | null;
  convite_expira_em: string | null;
  convite_status: string | null;
  convite_token: string | null;
  convite_contato: string | null;
  convite_qtd: number | null;
  indicacao_de: string | null;
  reservado_para?: string | null;
  anfitriao_externo?: string | null;
}

const INATIVOS: StatusIngresso[] = ["cancelado", "recusado", "convite_expirado"];
const POS_APROVACAO: StatusIngresso[] = ["aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado"];

const ALTERAVEIS: StatusIngresso[] = ["solicitado", "validado_area", "aprovado", "facial_ok", "facial_pendente", "lista_espera"];

export function ListaArea({ evento, setor, area, areaNome, linhas, eventoInfo, podeAlterar, prazo, facial = true, resgate = false, resgates = {}, areas = [], isAdmin = false, anfitrioes = [] }: {
  evento: string; setor: Setor; area: string; areaNome: string; linhas: LinhaLista[];
  eventoInfo: { titulo: string; inicio: string; abertura_portoes: string | null };
  podeAlterar: boolean; prazo: string;
  /** Evento exige facial: mostra o passo a passo do Galo ID. */
  facial?: boolean;
  /** Evento com link de resgate único e quem já abriu o resgate (por ingresso). */
  resgate?: boolean;
  resgates?: Record<string, boolean>;
  /** Todas as áreas do evento. */
  areas?: { id: string; nome: string }[];
  /** Se é admin. */
  isAdmin?: boolean;
  /** Camarote (Admin): quem está ativo na lista do jogo, para escolher de quem cada um é convidado. */
  anfitrioes?: PessoaDaLista[];
}) {
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [alterandoArea, setAlterandoArea] = useState<string | null>(null);
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  // Camarote (Admin): "Convidado de…" por pessoa e para várias de uma vez
  const vinculo = isAdmin && setor === "camarote";
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [lote, setLote] = useState(false);

  const rodar = (f: () => Promise<{ ok: boolean; erro?: string; mensagem?: string }>) =>
    iniciar(async () => {
      const r = await f();
      setRetorno(r.ok ? { ok: true, msg: r.mensagem ?? "Feito." } : { ok: false, msg: r.erro ?? "Erro" });
      if (r.ok) setEditando(null);
    });

  // Convites ainda não preenchidos: uma linha por convite
  const aguardando = new Map<string, LinhaLista[]>();
  for (const l of linhas) if (l.convite_id && !l.nome && ["convite_enviado", "aguardando_preenchimento"].includes(l.status)) {
    aguardando.set(l.convite_id, [...(aguardando.get(l.convite_id) ?? []), l]);
  }
  // reservas (sem nome ainda) aparecem como "Reservado para …"
  const pessoas = linhas.filter((l) => (l.nome || l.status === "reservado") && (mostrarInativos || !INATIVOS.includes(l.status)));
  const inativos = linhas.filter((l) => l.nome && INATIVOS.includes(l.status)).length;
  const selecionaveis = pessoas.filter((l) => l.nome && l.status !== "reservado" && !INATIVOS.includes(l.status));
  const marcar = (id: string, v: boolean) => setSel((x) => { const n = new Set(x); if (v) n.add(id); else n.delete(id); return n; });

  return (
    <div className="space-y-6">
      {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}
      <p className="text-xs text-tinta/60">
        {podeAlterar
          ? <>Trocas e cancelamentos de convidados são permitidos até <b>{prazo}</b> (enquanto o ingresso não foi enviado).</>
          : <>O prazo de solicitação terminou: a lista está travada. Para qualquer ajuste, fale com o Marketing MRV.</>}
      </p>

      {aguardando.size > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-tinta/70">Convites aguardando preenchimento</h3>
          <Tabela>
            <thead><tr><th>Para</th><th>Lugares</th><th>Status</th><th>Expira</th><th className="text-right">Ações</th></tr></thead>
            <tbody>
              {[...aguardando.values()].map((ls) => {
                const c = ls[0];
                const expiraLogo = c.convite_expira_em && new Date(c.convite_expira_em).getTime() - Date.now() < 24 * 3600e3;
                const msg = textoConvite({ nome: c.convite_nome_previsto, evento: eventoInfo, setor, area: areaNome, token: c.convite_token!, qtd: ls.length });
                return (
                  <tr key={c.convite_id}>
                    <td className="font-medium">{c.convite_nome_previsto ?? "—"}{c.convite_contato && <div className="text-xs font-normal text-tinta/60">{celular(c.convite_contato)}</div>}</td>
                    <td className="tabular">{ls.length}</td>
                    <td><SeloStatus status={c.status} para="gestor" /></td>
                    <td className={expiraLogo ? "font-semibold text-orange-700" : ""}>{dataHora(c.convite_expira_em)}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <BotaoCopiar texto={linkTorcedor(c.convite_token!)} rotulo="Link" />
                        <BotaoCopiar texto={msg} rotulo="Mensagem" />
                        <BotaoWhatsApp link={linkWhatsApp(c.convite_contato, msg)} />
                        <button className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50" disabled={pendente}
                          onClick={() => confirm("Cancelar este convite? As vagas voltam para o saldo.") && rodar(() => cancelarConvite(evento, area, c.convite_id!))}>
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        </div>
      )}

      {alterandoArea && (
        <ModalAlterarArea
          ingressoId={alterandoArea}
          areas={areas.filter((a) => a.id !== area)}
          pendente={pendente}
          cancelar={() => setAlterandoArea(null)}
          confirmar={(novaArea) =>
            iniciar(async () => {
              const { alterarPessoaArea } = await import("../../adicionar-actions");
              const r = await alterarPessoaArea(evento, alterandoArea, novaArea);
              setRetorno(r.ok ? { ok: true, msg: r.mensagem ?? "Pessoa movida!" } : { ok: false, msg: r.erro ?? "Erro" });
              if (r.ok) setAlterandoArea(null);
            })
          }
        />
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-tinta/70">Pessoas</h3>
          {inativos > 0 && (
            <label className="flex items-center gap-2 text-xs text-tinta/60">
              <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} className="accent-mrv-700" />
              Mostrar cancelados/recusados ({inativos})
            </label>
          )}
        </div>
        {vinculo && sel.size > 0 && (
          <div className="mb-2 rounded-xl bg-mrv-50 p-3 ring-1 ring-mrv-600/30">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <b>{sel.size} selecionado{sel.size > 1 ? "s" : ""}</b>
              <Botao type="button" variante={lote ? "primario" : "secundario"} onClick={() => setLote((x) => !x)}>Definir “convidado de” para todos</Botao>
              <button type="button" className="text-xs text-tinta/60 hover:underline" onClick={() => { setSel(new Set()); setLote(false); }}>limpar seleção</button>
            </div>
            {lote && (
              <div className="mt-3">
                <DefinirAnfitriao nome={`${sel.size} pessoa${sel.size > 1 ? "s" : ""}`} inicial={{}}
                  anfitrioes={anfitrioes.filter((a) => !sel.has(a.id))} fechar={() => setLote(false)}
                  salvar={async (a) => {
                    const r = await definirConvidadoDeVarios(evento, [...sel], a);
                    if (r.ok) { setRetorno({ ok: true, msg: r.mensagem ?? "Feito." }); setSel(new Set()); }
                    return r;
                  }} />
              </div>
            )}
          </div>
        )}
        {pessoas.length === 0 ? (
          <Vazio>Nenhuma solicitação ainda.</Vazio>
        ) : (
          <Tabela>
            <thead><tr>
              {vinculo && (
                <th className="w-8">
                  <input type="checkbox" aria-label="Selecionar todos" className="accent-mrv-700"
                    checked={selecionaveis.length > 0 && selecionaveis.every((l) => sel.has(l.ingresso_id))}
                    onChange={(e) => setSel(e.target.checked ? new Set(selecionaveis.map((l) => l.ingresso_id)) : new Set())} />
                </th>
              )}
              <th>Nome</th><th>CPF</th><th>Celular</th><th>Vínculo</th><th>Status</th><th className="text-right">Ações</th></tr></thead>
            <tbody>
              {pessoas.map((l) => (
                vinculando === l.ingresso_id ? (
                  <tr key={l.ingresso_id}>
                    <td colSpan={vinculo ? 7 : 6}>
                      <DefinirAnfitriao nome={l.nome ?? ""} anfitrioes={anfitrioes.filter((a) => a.id !== l.ingresso_id)}
                        inicial={l.anfitriao_externo ? { externo: l.anfitriao_externo } : {}} fechar={() => setVinculando(null)}
                        salvar={async (a) => { const r = await definirConvidadoDe(evento, l.ingresso_id, a); if (r.ok) setRetorno({ ok: true, msg: r.mensagem ?? "Feito." }); return r; }} />
                    </td>
                  </tr>
                ) : editando === l.ingresso_id ? (
                  <tr key={l.ingresso_id}>
                    <td colSpan={vinculo ? 7 : 6}>
                      <FormEditar l={l} pendente={pendente} cancelar={() => setEditando(null)}
                        salvar={(p) => rodar(() => editarPessoa(evento, area, l.ingresso_id, p))} />
                    </td>
                  </tr>
                ) : (
                  <tr key={l.ingresso_id} className={INATIVOS.includes(l.status) ? "opacity-50" : sel.has(l.ingresso_id) ? "bg-mrv-50/60" : ""}>
                    {vinculo && (
                      <td>
                        {selecionaveis.includes(l) && (
                          <input type="checkbox" aria-label={`Selecionar ${l.nome}`} className="accent-mrv-700"
                            checked={sel.has(l.ingresso_id)} onChange={(e) => marcar(l.ingresso_id, e.target.checked)} />
                        )}
                      </td>
                    )}
                    <td className={l.titular || setor !== "camarote" ? "font-medium" : "pl-9"}>
                      {l.status === "reservado" ? <>🔖 Reservado para <b>{l.reservado_para ?? "—"}</b></> : l.nome}
                      {l.indicacao_de && l.titular && <div className="text-xs font-normal text-tinta/60">Indicação: {l.indicacao_de}</div>}
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap">{l.cpf && /^\d{11}$/.test(l.cpf) ? formatarCpf(l.cpf) : l.cpf}</td>
                    <td className="whitespace-nowrap">{celular(l.celular)}</td>
                    <td className="text-xs">
                      {setor !== "camarote" || l.status === "reservado" ? "—" : l.titular ? "Anfitrião" : <>Convidado de <b>{l.convidado_de_nome ?? "?"}</b></>}
                      {l.preenchido_por === "convidado" && <div><Selo tom="azul">Preenchido pelo convidado</Selo></div>}
                    </td>
                    <td><SeloStatus status={l.status} para="gestor" resgate={resgate} resgateAberto={resgates[l.ingresso_id]} /></td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {l.status === "solicitado" && podeAlterar && (
                          <button className="rounded-md bg-mrv-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-mrv-700 disabled:opacity-50" disabled={pendente}
                            onClick={() => rodar(() => validarIngresso(evento, area, l.ingresso_id))}>
                            Validar
                          </button>
                        )}
                        {POS_APROVACAO.includes(l.status) && (
                          <>
                            <BotaoCopiar texto={linkTorcedor(l.token)} rotulo="Link do convidado" />
                            {facial && ["aprovado", "facial_pendente"].includes(l.status) && (
                              <BotaoWhatsApp rotulo="Passo a passo" link={linkWhatsApp(l.celular, textoGaloId({ nome: l.nome!, evento: eventoInfo, setor, token: l.token }))} />
                            )}
                          </>
                        )}
                        {vinculo && selecionaveis.includes(l) && (
                          <button className="rounded-md px-2 py-1 text-xs font-semibold text-mrv-700 hover:bg-mrv-50" onClick={() => setVinculando(l.ingresso_id)}>Convidado de…</button>
                        )}
                        {isAdmin && (
                          <button className="rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50" onClick={() => setAlterandoArea(l.ingresso_id)}>Mudar área</button>
                        )}
                        {podeAlterar && ALTERAVEIS.includes(l.status) && (
                          <button className="rounded-md px-2 py-1 text-xs font-semibold text-mrv-700 hover:bg-mrv-50" onClick={() => setEditando(l.ingresso_id)}>Editar</button>
                        )}
                        {podeAlterar && ALTERAVEIS.includes(l.status) && (
                          <button className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50" disabled={pendente}
                            onClick={() => {
                              const motivo = prompt(`Cancelar o ingresso de ${l.nome}? Informe o motivo:`, "pedi mas não vou");
                              if (motivo !== null) rodar(() => cancelarIngresso(evento, area, l.ingresso_id, motivo));
                            }}>
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </Tabela>
        )}
      </div>
    </div>
  );
}

function FormEditar({ l, salvar, cancelar, pendente }: { l: LinhaLista; salvar: (p: { nome: string; cpf: string; celular: string; email: string }) => void; cancelar: () => void; pendente: boolean }) {
  const [p, setP] = useState({ nome: l.nome ?? "", cpf: "", celular: l.celular ?? "", email: l.email ?? "" });
  return (
    <div className="grid gap-2 py-1 sm:grid-cols-[2fr_1fr_1fr_1.4fr_auto] sm:items-center">
      <Entrada value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} placeholder="Nome completo" />
      <Entrada value={p.cpf} onChange={(e) => setP({ ...p, cpf: e.target.value })} placeholder="CPF (redigite)" inputMode="numeric" />
      <Entrada value={p.celular} onChange={(e) => setP({ ...p, celular: e.target.value })} placeholder="Celular" inputMode="tel" />
      <Entrada value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} placeholder="E-mail" />
      <div className="flex gap-2">
        <Botao type="button" onClick={() => salvar(p)} disabled={pendente || !p.cpf}>Salvar</Botao>
        <Botao type="button" variante="fantasma" onClick={cancelar}>Voltar</Botao>
      </div>
    </div>
  );
}

function ModalAlterarArea({ ingressoId, areas, pendente, cancelar, confirmar }: {
  ingressoId: string; areas: { id: string; nome: string }[]; pendente: boolean;
  cancelar: () => void; confirmar: (novaArea: string) => void;
}) {
  const [novaArea, setNovaArea] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Cartao className="w-full max-w-sm space-y-4 p-6">
        <h3 className="text-lg font-bold text-mrv-900">Mudar para qual área?</h3>
        <select value={novaArea} onChange={(e) => setNovaArea(e.target.value)} className="w-full rounded-lg border border-borda px-3 py-2">
          <option value="">Escolha a área…</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
        <div className="flex gap-2 justify-end">
          <Botao type="button" variante="fantasma" onClick={cancelar} disabled={pendente}>Cancelar</Botao>
          <Botao type="button" onClick={() => confirmar(novaArea)} disabled={pendente || !novaArea}>Confirmar</Botao>
        </div>
      </Cartao>
    </div>
  );
}
