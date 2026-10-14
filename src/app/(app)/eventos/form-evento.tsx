"use client";
import { useActionState, useState } from "react";
import { AreaTexto, Aviso, Botao, Campo, Entrada, Selecao } from "@/components/ui";
import { paraInputLocal } from "@/lib/formato";
import type { Resultado } from "@/lib/erros";
import type { Evento } from "@/lib/tipos";

type Acao = (estado: Resultado | null, form: FormData) => Promise<Resultado>;

export function FormEvento({ acao, evento, anteriores }: { acao: Acao; evento?: Evento; anteriores?: { id: string; titulo: string; inicio: string }[] }) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  const [tipo, setTipo] = useState(evento?.tipo ?? "jogo");
  const novo = !evento;
  return (
    <form action={enviar} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Tipo">
          <Selecao name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "jogo" | "show")} disabled={!novo}>
            <option value="jogo">Jogo do Galo (mando)</option>
            <option value="show">Show</option>
          </Selecao>
          {!novo && <input type="hidden" name="tipo" value={tipo} />}
        </Campo>
        {tipo === "jogo" ? (
          <Campo rotulo="Adversário">
            <Entrada name="adversario" defaultValue={evento?.adversario ?? ""} placeholder="Montevideo" required />
          </Campo>
        ) : (
          <Campo rotulo="Atração">
            <Entrada name="atracao" defaultValue={evento?.atracao ?? ""} required />
          </Campo>
        )}
        <Campo rotulo="Título" dica="Em branco: “Galo × adversário” ou o nome da atração">
          <Entrada name="titulo" defaultValue={evento?.titulo ?? ""} />
        </Campo>
        <Campo rotulo={tipo === "jogo" ? "Competição" : "Produtora / observação curta"}>
          <Entrada name="competicao" defaultValue={evento?.competicao ?? ""} placeholder={tipo === "jogo" ? "Brasileirão, Libertadores…" : ""} />
        </Campo>
        <Campo rotulo="Data e hora do evento">
          <Entrada type="datetime-local" name="inicio" defaultValue={paraInputLocal(evento?.inicio)} required />
        </Campo>
        <Campo rotulo="Abertura dos portões">
          <Entrada type="datetime-local" name="abertura_portoes" defaultValue={paraInputLocal(evento?.abertura_portoes)} />
        </Campo>
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
          Jogo concorrido <span className="text-tinta/60">(camarote por fila de prioridade)</span>
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
