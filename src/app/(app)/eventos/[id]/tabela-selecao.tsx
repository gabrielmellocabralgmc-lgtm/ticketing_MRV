"use client";
// Tabela com seleção múltipla e ações em lote (aprovação, Galo ID, envio).
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { BotaoCopiar, BotaoWhatsApp } from "@/components/copiar";
import { Aviso, Botao, Selo, SeloStatus, Tabela, Vazio } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { celular } from "@/lib/formato";
import { linkTorcedor, linkWhatsApp, textoGaloId, textoIngressoEnviado } from "@/lib/mensagens";
import type { Resultado } from "@/lib/erros";
import { ROTULO_SETOR, type Setor, type StatusIngresso } from "@/lib/tipos";

export interface LinhaIngresso {
  id: string;
  setor: Setor;
  area_id: string;
  area_nome: string;
  status: StatusIngresso;
  nome: string | null;
  cpf: string | null;
  celular: string | null;
  email: string | null;
  token: string;
  convidado_de: string | null;
  convidado_de_nome: string | null;
  indicacao_de: string | null;
  preenchido_por: string | null;
  enviado_em: string | null;
  facial_em: string | null;
}

export interface AcaoLote {
  rotulo: string;
  variante?: "primario" | "secundario" | "perigo" | "laranja";
  pedirMotivo?: string;
  confirmar?: string;
  executar: (ids: string[], motivo: string) => Promise<Resultado>;
}

/** Ação de uma linha só (ex.: envio manual um a um no sistema do Atlético). */
export interface AcaoLinha {
  rotulo: string;
  copiarCpf?: (qtd: number) => Promise<void>; // mostra "Copiar CPF" e registra a cópia
  confirmar?: string;
  executar: (ids: string[]) => Promise<Resultado>;
}

export function TabelaSelecao({
  linhas, acoes, evento, mensagem, vazio = "Nada por aqui.", extra, acaoLinha,
}: {
  linhas: LinhaIngresso[];
  acoes: AcaoLote[];
  evento: { titulo: string; inicio: string; abertura_portoes: string | null };
  mensagem?: "galo_id" | "enviado";
  vazio?: string;
  extra?: (l: LinhaIngresso) => ReactNode;
  acaoLinha?: AcaoLinha;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const ids = useMemo(() => linhas.map((l) => l.id), [linhas]);
  const todos = sel.size > 0 && ids.every((i) => sel.has(i));
  const selecionados = ids.filter((i) => sel.has(i));

  const rodar = (a: AcaoLote) => {
    if (!selecionados.length) return;
    let motivo = "";
    if (a.pedirMotivo) {
      const m = prompt(a.pedirMotivo);
      if (m === null) return;
      motivo = m;
    } else if (a.confirmar && !confirm(a.confirmar.replace("{n}", String(selecionados.length)))) return;
    iniciar(async () => {
      const r = await a.executar(selecionados, motivo);
      setRetorno(r.ok ? { ok: true, msg: r.mensagem ?? "Feito." } : { ok: false, msg: r.erro });
      if (r.ok) setSel(new Set());
    });
  };

  if (!linhas.length) return <Vazio>{vazio}</Vazio>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-tinta/60">{selecionados.length ? `${selecionados.length} selecionado(s)` : `${linhas.length} pessoa(s)`}</span>
        {acoes.map((a) => (
          <Botao key={a.rotulo} variante={a.variante ?? "secundario"} disabled={pendente || !selecionados.length} onClick={() => rodar(a)}>
            {a.rotulo}
          </Botao>
        ))}
      </div>
      {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}
      <Tabela>
        <thead>
          <tr>
            <th className="w-8">
              <input type="checkbox" aria-label="Selecionar todos" checked={todos} className="accent-mrv-700"
                onChange={(e) => setSel(e.target.checked ? new Set(ids) : new Set())} />
            </th>
            <th>Nome</th><th>CPF</th><th>Área · setor</th><th>Vínculo</th><th>Status</th><th className="text-right">Contato</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const texto = mensagem === "galo_id"
              ? textoGaloId({ nome: l.nome ?? "", evento, setor: l.setor, token: l.token })
              : mensagem === "enviado" ? textoIngressoEnviado({ nome: l.nome ?? "", evento, setor: l.setor, token: l.token }) : null;
            return (
              <tr key={l.id} className={sel.has(l.id) ? "bg-mrv-50/60" : ""}>
                <td>
                  <input type="checkbox" aria-label={`Selecionar ${l.nome}`} checked={sel.has(l.id)} className="accent-mrv-700"
                    onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })} />
                </td>
                <td className="font-medium">
                  {l.nome}
                  {l.preenchido_por === "convidado" && <span className="ml-1"><Selo tom="azul">convidado preencheu</Selo></span>}
                </td>
                <td className="font-mono text-xs whitespace-nowrap">{l.cpf ? formatarCpf(l.cpf) : "—"}</td>
                <td className="text-xs">{l.area_nome}<div className="text-tinta/50">{ROTULO_SETOR[l.setor]}</div></td>
                <td className="text-xs">{l.convidado_de ? `Convidado de ${l.convidado_de_nome ?? "?"}` : "Titular"}{l.indicacao_de && !l.convidado_de && <div className="text-tinta/50">Indicação: {l.indicacao_de}</div>}</td>
                <td><SeloStatus status={l.status} />{extra?.(l)}</td>
                <td>
                  <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
                    <span className="text-tinta/60">{celular(l.celular)}</span>
                    {texto && l.celular && <BotaoWhatsApp link={linkWhatsApp(l.celular, texto)} rotulo={mensagem === "galo_id" ? "Passo a passo" : "Avisar"} />}
                    <BotaoCopiar texto={linkTorcedor(l.token)} rotulo="Link" />
                    {acaoLinha?.copiarCpf && l.cpf && (
                      <BotaoCopiar texto={l.cpf} rotulo="Copiar CPF" aoCopiar={() => acaoLinha.copiarCpf?.(1)} />
                    )}
                    {acaoLinha && (
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() => (!acaoLinha.confirmar || confirm(acaoLinha.confirmar.replace("{nome}", l.nome ?? ""))) && iniciar(async () => {
                          const r = await acaoLinha.executar([l.id]);
                          setRetorno(r.ok ? { ok: true, msg: `${l.nome}: ${r.mensagem ?? "feito"}` } : { ok: false, msg: r.erro });
                        })}
                        className="rounded-md bg-mrv-700 px-2 py-1 text-xs font-semibold text-white hover:bg-mrv-900 disabled:opacity-50"
                      >
                        {acaoLinha.rotulo}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Tabela>
    </div>
  );
}
