"use client";
import { useMemo, useState } from "react";
import { BotaoCopiar } from "@/components/copiar";
import { Campo, Cartao, Selecao } from "@/components/ui";
import type { Resultado } from "@/lib/erros";
import { ROTULO_SETOR, STATUS_INGRESSO, type Setor, type StatusIngresso } from "@/lib/tipos";
import { TabelaSelecao, type LinhaIngresso } from "../tabela-selecao";

type Grupo = "a_enviar" | "sem_facial" | "enviados";
const GRUPOS: Record<Grupo, { rotulo: string; status: StatusIngresso[] }> = {
  a_enviar: { rotulo: "A enviar (facial OK)", status: ["facial_ok"] },
  sem_facial: { rotulo: "Aprovados sem facial", status: ["aprovado", "facial_pendente"] },
  enviados: { rotulo: "Enviados", status: ["enviado", "confirmado"] },
};

export function PainelEnvio({ linhas, evento, acoes }: {
  linhas: LinhaIngresso[];
  evento: { titulo: string; inicio: string; abertura_portoes: string | null };
  acoes: {
    enviados: (ids: string[]) => Promise<Resultado>;
    enviadosSemFacial: (ids: string[]) => Promise<Resultado>;
    registrarCopia: (tipo: "cpfs" | "nome_cpf", qtd: number) => Promise<void>;
  };
}) {
  const [grupo, setGrupo] = useState<Grupo>("a_enviar");
  const [setor, setSetor] = useState<"" | Setor>("");
  const [area, setArea] = useState("");

  const areas = useMemo(() => [...new Map(linhas.map((l) => [l.area_id, l.area_nome])).entries()], [linhas]);
  const setores = useMemo(() => [...new Set(linhas.map((l) => l.setor))], [linhas]);
  const contagem = (g: Grupo) => linhas.filter((l) => GRUPOS[g].status.includes(l.status) && (!setor || l.setor === setor) && (!area || l.area_id === area)).length;
  const filtradas = linhas.filter((l) => GRUPOS[grupo].status.includes(l.status) && (!setor || l.setor === setor) && (!area || l.area_id === area));
  const comCpf = filtradas.filter((l) => l.cpf);
  const cpfs = comCpf.map((l) => l.cpf).join("\n");
  const nomeCpf = comCpf.map((l) => `${l.nome};${l.cpf}`).join("\n");

  return (
    <div className="space-y-6">
      <Cartao>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(GRUPOS) as Grupo[]).map((g) => (
              <button key={g} onClick={() => setGrupo(g)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${g === grupo ? "bg-mrv-700 text-white" : "bg-white text-mrv-700 ring-1 ring-mrv-700/20"}`}>
                {GRUPOS[g].rotulo} ({contagem(g)})
              </button>
            ))}
          </div>
          <Campo rotulo="Setor" className="w-44">
            <Selecao value={setor} onChange={(e) => setSetor(e.target.value as Setor | "")}>
              <option value="">Todos</option>
              {setores.map((s) => <option key={s} value={s}>{ROTULO_SETOR[s]}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Área" className="w-56">
            <Selecao value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">Todas</option>
              {areas.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </Selecao>
          </Campo>
        </div>
      </Cartao>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Cartao>
          <TabelaSelecao
            key={grupo + setor + area}
            linhas={filtradas}
            evento={evento}
            mensagem={grupo === "enviados" ? "enviado" : grupo === "sem_facial" ? "galo_id" : undefined}
            vazio={grupo === "a_enviar" ? "Ninguém com facial confirmada esperando envio." : "Nada neste filtro."}
            acoes={
              grupo === "a_enviar"
                ? [{ rotulo: "Marcar como enviados", variante: "primario", confirmar: "Marcar {n} ingresso(s) como enviados no sistema do Atlético?", executar: acoes.enviados }]
                : grupo === "sem_facial"
                  ? [{ rotulo: "Enviar mesmo sem facial", variante: "laranja", confirmar: "Marcar {n} como enviados SEM a facial confirmada? Isso fica registrado.", executar: acoes.enviadosSemFacial }]
                  : []
            }
          />
        </Cartao>
        <Cartao className="h-fit space-y-3 lg:sticky lg:top-4">
          <h2 className="font-bold text-mrv-900">Copiar para o sistema do Atlético</h2>
          <p className="text-xs text-tinta/60">{comCpf.length} CPF(s) no filtro atual · {GRUPOS[grupo].rotulo.toLowerCase()}. A cópia fica registrada na auditoria.</p>
          <textarea readOnly value={cpfs} rows={8} className="w-full rounded-lg bg-fundo p-2 font-mono text-xs ring-1 ring-black/10" aria-label="CPFs" />
          <div className="flex flex-wrap gap-2">
            <BotaoCopiar texto={cpfs} rotulo="Copiar CPFs" aoCopiar={() => acoes.registrarCopia("cpfs", comCpf.length)} />
            <BotaoCopiar texto={nomeCpf} rotulo="Copiar Nome;CPF" aoCopiar={() => acoes.registrarCopia("nome_cpf", comCpf.length)} />
          </div>
          <p className="text-xs text-tinta/50">
            Status: {GRUPOS[grupo].status.map((s) => STATUS_INGRESSO[s].rotulo).join(", ")}
          </p>
        </Cartao>
      </div>
    </div>
  );
}
