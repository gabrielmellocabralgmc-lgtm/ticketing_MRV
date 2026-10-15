"use client";
import { useState } from "react";
import { Aviso, Botao, Campo, Cartao, Entrada } from "@/components/ui";
import { ROTULO_SETOR, type Setor } from "@/lib/tipos";
import { adicionarConvidadoAdmin } from "./adicionar-actions";
import { FormSolicitacao } from "./areas/[area]/form-solicitacao";

export interface OpcaoSetor {
  setor: Setor;
  /** Saldo por área (cota − ocupados); null = setor sem cota por área. */
  saldos: Record<string, number | null>;
  disponiveis: number;
  /** Cota ainda não distribuída a nenhuma área. */
  livre: number;
}

/** Admin: adiciona convidado que chegou por WhatsApp, e-mail etc. Abate da cota da área e entra pronto para envio. */
export function AdicionarConvidado({ evento, areas, setores }: { evento: string; areas: { id: string; nome: string }[]; setores: OpcaoSetor[] }) {
  const [aberto, setAberto] = useState(false);
  const [setor, setSetor] = useState<Setor>(setores.find((s) => s.setor !== "camarote")?.setor ?? setores[0]?.setor ?? "arquibancada");
  const [area, setArea] = useState("");
  const [semSaldo, setSemSaldo] = useState<"espera" | "abater">("espera");
  // "" = nenhuma escolhida; "livre" = saldo livre do setor; senão, id da área que cede a cota
  const [doador, setDoador] = useState("");
  const [origem, setOrigem] = useState("");

  if (!aberto) {
    return <Botao type="button" variante="primario" onClick={() => setAberto(true)}>+ Adicionar convidado</Botao>;
  }
  const op = setores.find((s) => s.setor === setor);
  const saldoArea = area && op ? op.saldos[area] ?? null : null;
  // setor sem cota por área: o limite é o que resta no setor
  const saldo = saldoArea ?? op?.disponiveis ?? 0;

  return (
    <Cartao className="mb-6 w-full ring-2 ring-mrv-700/30">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-mrv-900">Adicionar convidado</h2>
          <p className="text-sm text-tinta/60">
            Para pedidos que chegaram por WhatsApp, e-mail etc. Vale tudo da regra (CPF válido, sem duplicidade no evento, cota da área),
            mas <b>sem validação</b>: entra direto na lista final como <b>Pronto para envio</b>.
          </p>
        </div>
        <button type="button" onClick={() => setAberto(false)} className="text-sm font-semibold text-tinta/60 hover:text-tinta">Fechar ✕</button>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Setor">
          <select value={setor} onChange={(e) => setSetor(e.target.value as Setor)} className="min-h-10 w-full rounded-lg bg-white px-3 ring-1 ring-black/15">
            {setores.map((s) => <option key={s.setor} value={s.setor}>{ROTULO_SETOR[s.setor]}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Área (abate da cota dela)" dica={area ? (saldoArea === null ? `Setor sem cota por área · ${op?.disponiveis ?? 0} vaga(s) no setor` : `Saldo da área: ${saldoArea}`) : undefined}>
          <select value={area} onChange={(e) => setArea(e.target.value)} className="min-h-10 w-full rounded-lg bg-white px-3 ring-1 ring-black/15">
            <option value="">Escolha a área…</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Origem do pedido (opcional)" dica="Fica registrado no histórico">
          <Entrada value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Ex.: WhatsApp do diretor X" />
        </Campo>
      </div>
      {area ? (
        <FormSolicitacao key={`${setor}-${area}`} evento={evento} setor={setor} area={area} saldo={saldo}
          padraoConvidados={0} avulsos
          excedeVaiParaEspera={semSaldo === "espera"}
          enviarCom={async (pessoas) => {
            if (semSaldo === "abater" && pessoas.length > saldo && !doador) return { ok: false, erro: "Escolha de qual área sai o ingresso." };
            return adicionarConvidadoAdmin(evento, setor, area, pessoas,
              semSaldo === "abater" && pessoas.length > saldo ? { doador: doador === "livre" ? null : doador } : "espera", origem);
          }}
          avisoExcede={
            <Aviso tom="alerta">
              <p className="font-semibold">{saldo === 0 ? "A área não tem saldo." : `A área tem só ${saldo} de saldo para este pedido.`}</p>
              <div className="mt-2 space-y-2">
                <label className="flex items-center gap-2"><input type="radio" checked={semSaldo === "espera"} onChange={() => setSemSaldo("espera")} className="accent-mrv-700" /> Adicionar na lista de espera</label>
                {saldoArea !== null && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2"><input type="radio" checked={semSaldo === "abater"} onChange={() => setSemSaldo("abater")} className="accent-mrv-700" /> Adicionar mesmo assim e abater da cota de</label>
                    <select value={doador} onChange={(e) => { setDoador(e.target.value); setSemSaldo("abater"); }}
                      className="min-h-9 rounded-lg bg-white px-2 text-sm text-tinta ring-1 ring-black/15">
                      <option value="">escolha…</option>
                      {(op?.livre ?? 0) > 0 && <option value="livre">Saldo livre do setor (saldo {op!.livre})</option>}
                      {areas.filter((a) => a.id !== area).map((a) => {
                        const sa = op?.saldos[a.id] ?? 0;
                        return <option key={a.id} value={a.id} disabled={sa === 0}>{a.nome} (saldo {sa})</option>;
                      })}
                    </select>
                  </div>
                )}
                {semSaldo === "abater" && doador && (
                  <p className="text-xs">
                    O que faltar sai da cota de <b>{doador === "livre" ? "saldo livre do setor" : areas.find((a) => a.id === doador)?.nome}</b>
                    {" "}(saldo dessa área: {doador === "livre" ? op?.livre : op?.saldos[doador] ?? 0}) e passa para a área escolhida. Fica no histórico de cotas.
                  </p>
                )}
              </div>
            </Aviso>
          } />
      ) : (
        <p className="text-sm text-tinta/60">Escolha a área para preencher os dados.</p>
      )}
    </Cartao>
  );
}
