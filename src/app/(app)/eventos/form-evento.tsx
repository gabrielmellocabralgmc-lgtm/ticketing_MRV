"use client";
import { useActionState, useState } from "react";
import { AreaTexto, Aviso, Botao, Campo, Entrada, Selecao } from "@/components/ui";
import { paraInputLocal } from "@/lib/formato";
import type { Resultado } from "@/lib/erros";
import type { Evento } from "@/lib/tipos";

type Acao = (estado: Resultado | null, form: FormData) => Promise<Resultado>;

/** "2026-10-17T19:00" → "17/10 às 16:00" (3 h antes) */
function portoesJogo(inicio: string) {
  if (!inicio) return "3 h antes do jogo";
  const [d, h] = inicio.split("T");
  const [hh, mm] = h.split(":").map(Number);
  const total = hh * 60 + mm - 180;
  const [, mes, dia] = d.split("-");
  if (total < 0) return "3 h antes do jogo (dia anterior)";
  return `${dia}/${mes} às ${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function FormEvento({ acao, evento, anteriores }: { acao: Acao; evento?: Evento; anteriores?: { id: string; titulo: string; inicio: string }[] }) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  const [tipo, setTipo] = useState(evento?.tipo ?? "jogo");
  const [nome, setNome] = useState((evento?.tipo === "show" ? evento?.atracao : evento?.adversario) ?? "");
  const [inicio, setInicio] = useState(paraInputLocal(evento?.inicio));
  const novo = !evento;
  return (
    <form action={enviar} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Tipo">
          <Selecao name="tipo" value={tipo} onChange={(e) => { setTipo(e.target.value as "jogo" | "show"); setNome(""); }} disabled={!novo}>
            <option value="jogo">Jogo do Galo (mando)</option>
            <option value="show">Show</option>
          </Selecao>
          {!novo && <input type="hidden" name="tipo" value={tipo} />}
        </Campo>
        {tipo === "jogo" ? (
          <Campo rotulo="Adversário" dica={`Título: “Galo × ${nome || "adversário"}”`}>
            <Entrada name="adversario" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Coritiba" required />
          </Campo>
        ) : (
          <Campo rotulo="Nome do show" dica="É o título do evento">
            <Entrada name="atracao" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Gilberto Gil" required />
          </Campo>
        )}
        <Campo rotulo={tipo === "jogo" ? "Competição" : "Produtora / observação curta"}>
          <Entrada name="competicao" defaultValue={evento?.competicao ?? ""} placeholder={tipo === "jogo" ? "Brasileirão, Libertadores…" : ""} />
        </Campo>
        <Campo rotulo="Data e hora do evento">
          <Entrada type="datetime-local" name="inicio" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
        </Campo>
        {tipo === "jogo" ? (
          <Campo rotulo="Abertura dos portões" dica="Automática: 3 h antes do jogo">
            <Entrada value={portoesJogo(inicio)} disabled readOnly aria-label="Abertura dos portões (automática)" />
          </Campo>
        ) : (
          <Campo rotulo="Abertura dos portões (horário)" dica="No mesmo dia do show">
            <Entrada type="time" name="portoes_hora" defaultValue={paraInputLocal(evento?.abertura_portoes).slice(11, 16)} />
          </Campo>
        )}
        <Campo rotulo="Prazo de solicitação (áreas)">
          <Entrada type="datetime-local" name="prazo_solicitacao" defaultValue={paraInputLocal(evento?.prazo_solicitacao)} />
        </Campo>
        <Campo rotulo="Prazo de validação (responsáveis)">
          <Entrada type="datetime-local" name="prazo_validacao" defaultValue={paraInputLocal(evento?.prazo_validacao)} />
        </Campo>
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="concorrido" defaultChecked={evento?.concorrido} className="size-4 accent-mrv-700" />
          {tipo === "jogo" ? "Jogo concorrido" : "Show concorrido"} <span className="text-tinta/60">(camarote por fila de prioridade)</span>
        </label>
        {tipo === "show" && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="show_proprio" defaultChecked={evento?.show_proprio ?? true} className="size-4 accent-mrv-700" />
            Show próprio da Arena <span className="text-tinta/60">(desmarcado: MRV compra o camarote a preço de custo)</span>
          </label>
        )}
      </div>
      {novo && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Cotas" dica="Padrão do regulamento ou copiar as cotas de um evento anterior">
            <Selecao name="duplicar_de" defaultValue="">
              <option value="">Padrão do regulamento</option>
              {anteriores?.map((a) => (
                <option key={a.id} value={a.id}>Copiar de: {a.titulo} ({new Date(a.inicio).toLocaleDateString("pt-BR")})</option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Status inicial">
            <Selecao name="status" defaultValue="rascunho">
              <option value="rascunho">Rascunho (só Marketing vê)</option>
              <option value="aberto">Aberto para solicitações</option>
            </Selecao>
          </Campo>
        </div>
      )}
      <Campo rotulo="Observações internas">
        <AreaTexto name="observacoes" rows={2} defaultValue={evento?.observacoes ?? ""} />
      </Campo>
      {estado && (estado.ok ? estado.mensagem && <Aviso tom="ok">{estado.mensagem}</Aviso> : <Aviso tom="erro">{estado.erro}</Aviso>)}
      <Botao type="submit" disabled={pendente}>{pendente ? "Salvando…" : novo ? "Criar evento" : "Salvar alterações"}</Botao>
    </form>
  );
}
