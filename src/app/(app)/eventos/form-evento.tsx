"use client";
import { useActionState, useState } from "react";
import { AreaTexto, Aviso, Botao, Campo, Entrada, Selecao } from "@/components/ui";
import { paraInputLocal } from "@/lib/formato";
import type { Resultado } from "@/lib/erros";
import { ROTULO_SETOR, type Evento, type Setor } from "@/lib/tipos";
import { CotasNovoEvento, cotasIniciais, type AreaSimples, type PadraoTipo } from "./cotas-novo";

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

export function FormEvento({ acao, evento, anteriores, padrao, areas = [], temCamarote = true }: {
  acao: Acao; evento?: Evento; anteriores?: { id: string; titulo: string; inicio: string }[];
  /** Cotas padrão por tipo (config), para personalizar antes de criar. */
  padrao?: Record<string, PadraoTipo>;
  areas?: AreaSimples[];
  temCamarote?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  const [tipo, setTipo] = useState(evento?.tipo ?? "jogo");
  const [nome, setNome] = useState((evento?.tipo === "show" ? evento?.atracao : evento?.adversario) ?? "");
  const [inicio, setInicio] = useState(paraInputLocal(evento?.inicio));
  const novo = !evento;
  const [camarote, setCamarote] = useState(temCamarote);
  const [duplicar, setDuplicar] = useState("");
  const [personalizar, setPersonalizar] = useState(false);
  const [digital, setDigital] = useState(evento?.ingressos_digitais ?? (evento?.tipo ?? "jogo") === "show");
  const [cotas, setCotas] = useState<Record<string, PadraoTipo>>(() =>
    Object.fromEntries(Object.entries(padrao ?? {}).map(([t, p]) => [t, cotasIniciais(p, areas)])));
  const cotasTipo = cotas[tipo] ?? {};
  // o que vai para o servidor: só os setores ativos (sem camarote, se desmarcado)
  const cotasEnviar = Object.fromEntries(Object.entries(cotasTipo).filter(([s]) => camarote || s !== "camarote"));
  return (
    <form action={enviar} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Tipo">
          <Selecao name="tipo" value={tipo} onChange={(e) => { setTipo(e.target.value as "jogo" | "show"); setNome(""); setDigital(e.target.value === "show"); }} disabled={!novo}>
            <option value="jogo">Jogo do Galo (mando)</option>
            <option value="show">Show</option>
          </Selecao>
          {!novo && <input type="hidden" name="tipo" value={tipo} />}
        </Campo>
        {tipo === "jogo" ? (
          <Campo rotulo="Adversário" dica={`Título: “Galo × ${nome || "adversário"}”`}>
            <Entrada key="adversario" name="adversario" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Coritiba" required />
          </Campo>
        ) : (
          <Campo rotulo="Nome do show" dica="É o título do evento">
            <Entrada key="atracao" name="atracao" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Gilberto Gil" required />
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
            <Entrada key="portoes-jogo" value={portoesJogo(inicio)} disabled readOnly aria-label="Abertura dos portões (automática)" />
          </Campo>
        ) : (
          <Campo rotulo="Abertura dos portões (horário)" dica="No mesmo dia do show">
            <Entrada key="portoes-show" type="time" name="portoes_hora" defaultValue={paraInputLocal(evento?.abertura_portoes).slice(11, 16)} />
          </Campo>
        )}
        <Campo rotulo="Prazo de solicitação (áreas)" dica="Vale também para alterar convidados e validar a lista">
          <Entrada type="datetime-local" name="prazo_solicitacao" defaultValue={paraInputLocal(evento?.prazo_solicitacao)} />
        </Campo>
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="tem_camarote" checked={camarote} onChange={(e) => setCamarote(e.target.checked)} className="size-4 accent-mrv-700" />
          Camarote disponível neste evento <span className="text-tinta/60">(desmarcado: nada de camarote aparece no evento)</span>
        </label>
        <label key={`dig-${tipo}`} className="flex items-center gap-2">
          <input type="checkbox" name="ingressos_digitais" checked={digital} onChange={(e) => setDigital(e.target.checked)} className="size-4 accent-mrv-700" />
          Ingressos digitais enviados pelo sistema <span className="text-tinta/60">(PDF ou link, por e-mail)</span>
        </label>
        <label key={`fac-${tipo}`} className="flex items-center gap-2">
          <input type="checkbox" name="exige_facial" defaultChecked={evento?.exige_facial ?? tipo === "jogo"} className="size-4 accent-mrv-700" />
          Exige cadastro facial <span className="text-tinta/60">(Super App do Galo / Galo ID)</span>
        </label>
        {tipo === "show" && camarote && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="show_proprio" defaultChecked={evento?.show_proprio ?? true} className="size-4 accent-mrv-700" />
            Show próprio da Arena <span className="text-tinta/60">(desmarcado: MRV compra o camarote a preço de custo)</span>
          </label>
        )}
      </div>
      {digital && (
        <label className="flex items-start gap-2 rounded-lg bg-amarelo-500/10 p-3 text-sm ring-1 ring-amarelo-500/40">
          <input type="checkbox" name="resgate_unico" defaultChecked={evento?.resgate_unico ?? false} className="mt-0.5 size-4 accent-mrv-700" />
          <span>
            <b>Link de resgate de uso único (ex.: transferência Eventim)</b>
            <span className="block text-tinta/70">O link nunca vai no e-mail nem aparece para a equipe: o convidado lê o passo a passo (baixar o app, criar a conta com os próprios dados, entrar), confirma que é ele quem vai e resgata pela página pessoal, uma única vez.</span>
          </span>
        </label>
      )}
      {novo && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Cotas" dica="Padrão do regulamento ou copiar as cotas de um evento anterior">
            <Selecao name="duplicar_de" value={duplicar} onChange={(e) => { setDuplicar(e.target.value); if (e.target.value) setPersonalizar(false); }}>
              <option value="">Padrão do regulamento</option>
              {anteriores?.map((a) => (
                <option key={a.id} value={a.id}>Copiar de: {a.titulo} ({new Date(a.inicio).toLocaleDateString("pt-BR")})</option>
              ))}
            </Selecao>
          </Campo>
          {!duplicar && padrao && (
            <div className="sm:col-span-2">
              <button type="button" onClick={() => setPersonalizar((v) => !v)} className="text-sm font-semibold text-mrv-700 hover:underline">
                {personalizar ? "▾ Usar as cotas padrão (fechar)" : "▸ Personalizar cotas antes de criar"}
              </button>
              {personalizar && (
                <div className="mt-2">
                  <CotasNovoEvento valor={cotasTipo} areas={areas} camarote={camarote}
                    onChange={(v) => setCotas((c) => ({ ...c, [tipo]: v }))} />
                  <input type="hidden" name="cotas" value={JSON.stringify(cotasEnviar)} />
                </div>
              )}
            </div>
          )}
          <Campo rotulo="Status inicial">
            <Selecao name="status" defaultValue="rascunho">
              <option value="rascunho">Rascunho (só Marketing vê)</option>
              <option value="aberto">Aberto para solicitações</option>
            </Selecao>
          </Campo>
        </div>
      )}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Nome dos setores neste evento <span className="font-normal text-tinta/60">(opcional: em branco usa o nome padrão)</span></legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["pista", "arquibancada", "camarote"] as Setor[]).filter((s) => s !== "camarote" || camarote).map((s) => (
            <Campo key={s} rotulo={ROTULO_SETOR[s]}>
              <Entrada name={`nome_setor_${s}`} defaultValue={evento?.nomes_setores?.[s] ?? ""} placeholder={ROTULO_SETOR[s]} maxLength={60} />
            </Campo>
          ))}
        </div>
        <p className="text-xs text-tinta/60">Aparece em todas as telas, na página do convidado e nos e-mails. Ex.: “Cadeira Inferior”, “Pista Premium”.</p>
      </fieldset>
      <Campo rotulo="Orientações para o convidado (opcional)" dica="Uma por linha. Aparecem na página pessoal e no e-mail do ingresso. Ex.: classificação etária, documentos.">
        <AreaTexto name="orientacoes_convidado" rows={3} defaultValue={evento?.orientacoes_convidado ?? ""} />
      </Campo>
      <Campo rotulo="Observações internas">
        <AreaTexto name="observacoes" rows={2} defaultValue={evento?.observacoes ?? ""} />
      </Campo>
      {estado && (estado.ok ? estado.mensagem && <Aviso tom="ok">{estado.mensagem}</Aviso> : <Aviso tom="erro">{estado.erro}</Aviso>)}
      <Botao type="submit" disabled={pendente}>{pendente ? "Salvando…" : novo ? "Criar evento" : "Salvar alterações"}</Botao>
    </form>
  );
}
