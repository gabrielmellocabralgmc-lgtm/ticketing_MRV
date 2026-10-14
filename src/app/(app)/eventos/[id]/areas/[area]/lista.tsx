"use client";
import { useState, useTransition } from "react";
import { BotaoCopiar, BotaoWhatsApp } from "@/components/copiar";
import { Aviso, Botao, Entrada, Selo, SeloStatus, Tabela, Vazio } from "@/components/ui";
import { celular, dataHora } from "@/lib/formato";
import { linkTorcedor, linkWhatsApp, textoConvite, textoGaloId } from "@/lib/mensagens";
import type { Setor, StatusIngresso } from "@/lib/tipos";
import { cancelarConvite, cancelarIngresso, editarPessoa } from "./actions";

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
}

const INATIVOS: StatusIngresso[] = ["cancelado", "recusado", "convite_expirado"];
const POS_APROVACAO: StatusIngresso[] = ["aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado"];

export function ListaArea({ evento, setor, area, areaNome, linhas, eventoInfo }: {
  evento: string; setor: Setor; area: string; areaNome: string; linhas: LinhaLista[];
  eventoInfo: { titulo: string; inicio: string; abertura_portoes: string | null };
}) {
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();

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
  const pessoas = linhas.filter((l) => l.nome && (mostrarInativos || !INATIVOS.includes(l.status)));
  const inativos = linhas.filter((l) => l.nome && INATIVOS.includes(l.status)).length;

  return (
    <div className="space-y-6">
      {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}

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
                    <td><SeloStatus status={c.status} /></td>
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
        {pessoas.length === 0 ? (
          <Vazio>Nenhuma solicitação ainda.</Vazio>
        ) : (
          <Tabela>
            <thead><tr><th>Nome</th><th>CPF</th><th>Celular</th><th>Vínculo</th><th>Status</th><th className="text-right">Ações</th></tr></thead>
            <tbody>
              {pessoas.map((l) => (
                editando === l.ingresso_id ? (
                  <tr key={l.ingresso_id}>
                    <td colSpan={6}>
                      <FormEditar l={l} pendente={pendente} cancelar={() => setEditando(null)}
                        salvar={(p) => rodar(() => editarPessoa(evento, area, l.ingresso_id, p))} />
                    </td>
                  </tr>
                ) : (
                  <tr key={l.ingresso_id} className={INATIVOS.includes(l.status) ? "opacity-50" : ""}>
                    <td className={l.titular ? "font-medium" : "pl-9"}>
                      {l.nome}
                      {l.indicacao_de && l.titular && <div className="text-xs font-normal text-tinta/60">Indicação: {l.indicacao_de}</div>}
                    </td>
                    <td className="font-mono text-xs">{l.cpf}</td>
                    <td className="whitespace-nowrap">{celular(l.celular)}</td>
                    <td className="text-xs">
                      {l.titular ? "Titular" : `Convidado de ${l.convidado_de_nome ?? "?"}`}
                      {l.preenchido_por === "convidado" && <div><Selo tom="azul">Preenchido pelo convidado</Selo></div>}
                    </td>
                    <td><SeloStatus status={l.status} /></td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {POS_APROVACAO.includes(l.status) && (
                          <>
                            <BotaoCopiar texto={linkTorcedor(l.token)} rotulo="Link do torcedor" />
                            {["aprovado", "facial_pendente"].includes(l.status) && (
                              <BotaoWhatsApp rotulo="Galo ID" link={linkWhatsApp(l.celular, textoGaloId({ nome: l.nome!, evento: eventoInfo, setor, token: l.token }))} />
                            )}
                          </>
                        )}
                        {["solicitado", "lista_espera"].includes(l.status) && (
                          <button className="rounded-md px-2 py-1 text-xs font-semibold text-mrv-700 hover:bg-mrv-50" onClick={() => setEditando(l.ingresso_id)}>Editar</button>
                        )}
                        {!INATIVOS.includes(l.status) && !["enviado", "confirmado", "presente", "no_show"].includes(l.status) && (
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
