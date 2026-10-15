"use client";
// Admin e Marketing: as três formas de colocar alguém na lista do jogo, lado a lado.
//  · + Adicionar convidado — um ou poucos, digitados;
//  · Adicionar convidados em massa — colar a lista e, se quiser, vincular a um anfitrião
//    (alguém da lista ou de fora: credenciado, em outro camarote…);
//  · Link para convidados — o próprio convidado preenche.
// Tudo abate da cota da área e entra aprovado (pronto para envio).
import { useState, useTransition } from "react";
import { BotaoCopiar, BotaoWhatsApp } from "@/components/copiar";
import { Aviso, Botao, Campo, Cartao, Entrada, Selecao } from "@/components/ui";
import { linkTorcedor, linkWhatsApp, textoConvite } from "@/lib/mensagens";
import { ROTULO_SETOR, type Setor } from "@/lib/tipos";
import { adicionarConvidadoAdmin, gerarLinkConvidados, type Anfitriao } from "./adicionar-actions";
import type { OpcaoSetor } from "./adicionar-opcoes";
import { FormSolicitacao } from "./areas/[area]/form-solicitacao";

type Painel = "um" | "massa" | "link";
export interface PessoaDaLista { id: string; nome: string; setor: Setor }
interface Comum {
  evento: string; areas: { id: string; nome: string }[]; setores: OpcaoSetor[]; anfitrioes: PessoaDaLista[];
  setorInicial?: Setor; areaInicial?: string; eventoInfo: { titulo: string; inicio: string; abertura_portoes: string | null };
}

export function AcoesConvidados(p: Comum) {
  const [aberto, setAberto] = useState<Painel | null>(null);
  const botoes: { id: Painel; rotulo: string }[] = [
    { id: "um", rotulo: "+ Adicionar convidado" },
    { id: "massa", rotulo: "Adicionar convidados em massa" },
    { id: "link", rotulo: "Link para convidados" },
  ];
  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        {botoes.map((b) => (
          <Botao key={b.id} type="button" variante={aberto === b.id ? "primario" : "secundario"} aria-expanded={aberto === b.id}
            onClick={() => setAberto((a) => (a === b.id ? null : b.id))}>{b.rotulo}</Botao>
        ))}
      </div>
      {aberto && (
        <Cartao className="ring-2 ring-mrv-700/30">
          <div className="mb-1 flex justify-end">
            <button type="button" onClick={() => setAberto(null)} className="text-sm font-semibold text-tinta/60 hover:text-tinta">Fechar ✕</button>
          </div>
          {aberto === "link" ? <GerarLink {...p} /> : <AdicionarConvidado key={aberto} {...p} massa={aberto === "massa"} />}
        </Cartao>
      )}
    </div>
  );
}

function useSetorArea(p: Comum) {
  const [setor, setSetor] = useState<Setor>(p.setorInicial ?? p.setores.find((s) => s.setor !== "camarote")?.setor ?? p.setores[0]?.setor ?? "arquibancada");
  const [area, setArea] = useState(p.areaInicial ?? "");
  const op = p.setores.find((s) => s.setor === setor);
  const saldoArea = area && op ? op.saldos[area] ?? null : null;
  // setor sem cota por área (camarote): o limite é o que resta no setor
  const saldo = saldoArea ?? op?.disponiveis ?? 0;
  const campos = (
    <>
      <Campo rotulo="Setor">
        <Selecao value={setor} onChange={(e) => setSetor(e.target.value as Setor)}>
          {p.setores.map((s) => <option key={s.setor} value={s.setor}>{ROTULO_SETOR[s.setor]}</option>)}
        </Selecao>
      </Campo>
      <Campo rotulo="Área (abate da cota dela)" dica={area ? (saldoArea === null ? `Sem cota por área · ${op?.disponiveis ?? 0} vaga(s) no setor` : `Saldo da área: ${saldoArea}`) : undefined}>
        <Selecao value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Escolha a área…</option>
          {p.areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </Selecao>
      </Campo>
    </>
  );
  return { setor, area, op, saldo, saldoArea, campos };
}

/** Vincular a alguém: ninguém, alguém já na lista do jogo ou alguém de fora (não ocupa lugar). */
function EscolhaAnfitriao({ anfitrioes, valor, onChange }: { anfitrioes: PessoaDaLista[]; valor: Anfitriao; onChange: (a: Anfitriao) => void }) {
  const tipo = valor.ingresso !== undefined ? "lista" : valor.externo !== undefined ? "fora" : "nenhum";
  return (
    <div className="rounded-xl bg-fundo p-3">
      <div className="mb-2 text-sm font-semibold">Convidados de quem?</div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <label className="flex items-center gap-2"><input type="radio" checked={tipo === "nenhum"} onChange={() => onChange({})} className="accent-mrv-700" /> Sem vínculo</label>
        <label className="flex items-center gap-2"><input type="radio" checked={tipo === "lista"} onChange={() => onChange({ ingresso: "" })} className="accent-mrv-700" /> Alguém que já está na lista do jogo</label>
        <label className="flex items-center gap-2"><input type="radio" checked={tipo === "fora"} onChange={() => onChange({ externo: "" })} className="accent-mrv-700" /> Alguém de fora (credenciado, outro camarote…)</label>
      </div>
      {tipo === "lista" && (
        <div className="mt-2 max-w-md">
          <Selecao value={valor.ingresso ?? ""} onChange={(e) => onChange({ ingresso: e.target.value })} aria-label="Anfitrião da lista">
            <option value="">Escolha o diretor/colaborador…</option>
            {[...anfitrioes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((a) => (
              <option key={a.id} value={a.id}>{a.nome} · {ROTULO_SETOR[a.setor].split(" ")[0]}</option>
            ))}
          </Selecao>
        </div>
      )}
      {tipo === "fora" && (
        <div className="mt-2 max-w-md">
          <Entrada value={valor.externo ?? ""} onChange={(e) => onChange({ externo: e.target.value })} placeholder="Nome do diretor/colaborador" aria-label="Anfitrião de fora" />
          <p className="mt-1 text-xs text-cinza">Ele não ocupa lugar na lista; os convidados ficam liberados em nome dele.</p>
        </div>
      )}
    </div>
  );
}

const anfitriaoIncompleto = (a: Anfitriao) => (a.ingresso !== undefined && !a.ingresso) || (a.externo !== undefined && !a.externo.trim());

function AdicionarConvidado(p: Comum & { massa: boolean }) {
  const { setor, area, op, saldo, saldoArea, campos } = useSetorArea(p);
  const [semSaldo, setSemSaldo] = useState<"espera" | "abater">("espera");
  // "" = nenhuma escolhida; "livre" = saldo livre do setor; senão, id da área que cede a cota
  const [doador, setDoador] = useState("");
  const [origem, setOrigem] = useState("");
  const [anfitriao, setAnfitriao] = useState<Anfitriao>({});

  return (
    <div>
      <h2 className="text-lg font-bold text-mrv-900">{p.massa ? "Adicionar convidados em massa" : "Adicionar convidado"}</h2>
      <p className="mb-3 text-sm text-tinta/60">
        {p.massa ? "Cole a lista (uma pessoa por linha, com nome e CPF) e, se for o caso, diga de quem são os convidados. " : "Para pedidos que chegaram por WhatsApp, e-mail etc. "}
        Vale a regra (CPF válido, sem duplicidade no evento, cota da área), mas <b>sem validação</b>: entra direto como <b>Pronto para envio</b>.
      </p>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {campos}
        <Campo rotulo="Origem do pedido (opcional)" dica="Fica registrado no histórico">
          <Entrada value={origem} onChange={(e) => setOrigem(e.target.value)} placeholder="Ex.: WhatsApp do diretor X" />
        </Campo>
      </div>
      {p.massa && <div className="mb-4"><EscolhaAnfitriao anfitrioes={p.anfitrioes} valor={anfitriao} onChange={setAnfitriao} /></div>}
      {area ? (
        <FormSolicitacao key={`${setor}-${area}`} evento={p.evento} setor={setor} area={area} saldo={saldo}
          padraoConvidados={0} avulsos colarInicial={p.massa}
          excedeVaiParaEspera={semSaldo === "espera"}
          enviarCom={async (pessoas) => {
            if (p.massa && anfitriaoIncompleto(anfitriao)) return { ok: false, erro: "Escolha ou digite de quem são os convidados (ou marque “Sem vínculo”)." };
            if (semSaldo === "abater" && pessoas.length > saldo && !doador) return { ok: false, erro: "Escolha de qual área sai o ingresso." };
            return adicionarConvidadoAdmin(p.evento, setor, area, pessoas,
              semSaldo === "abater" && pessoas.length > saldo ? { doador: doador === "livre" ? null : doador } : "espera", origem, anfitriao);
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
                      {p.areas.filter((a) => a.id !== area).map((a) => {
                        const sa = op?.saldos[a.id] ?? 0;
                        return <option key={a.id} value={a.id} disabled={sa === 0}>{a.nome} (saldo {sa})</option>;
                      })}
                    </select>
                  </div>
                )}
                {semSaldo === "abater" && doador && (
                  <p className="text-xs">
                    O que faltar sai da cota de <b>{doador === "livre" ? "saldo livre do setor" : p.areas.find((a) => a.id === doador)?.nome}</b>
                    {" "}(saldo dessa área: {doador === "livre" ? op?.livre : op?.saldos[doador] ?? 0}) e passa para a área escolhida. Fica no histórico de cotas.
                  </p>
                )}
              </div>
            </Aviso>
          } />
      ) : (
        <p className="text-sm text-tinta/60">Escolha a área para preencher os dados.</p>
      )}
    </div>
  );
}

function GerarLink(p: Comum) {
  const { setor, area, saldo, campos } = useSetorArea(p);
  const [qtd, setQtd] = useState(1);
  const [para, setPara] = useState("");
  const [contato, setContato] = useState("");
  const [anfitriao, setAnfitriao] = useState<Anfitriao>({});
  const [gerado, setGerado] = useState<{ token: string; qtd: number; para: string; area: string; setor: Setor } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const daLista = anfitriao.ingresso !== undefined;

  if (gerado) {
    const msg = textoConvite({ nome: gerado.para || null, evento: p.eventoInfo, setor: gerado.setor, area: gerado.area, token: gerado.token, qtd: gerado.qtd });
    return (
      <div className="space-y-3">
        <Aviso tom="ok">Link gerado: {gerado.qtd} lugar(es) reservado(s). Quem preencher entra aprovado.</Aviso>
        <div className="break-all rounded-lg bg-fundo p-3 font-mono text-sm">{linkTorcedor(gerado.token)}</div>
        <div className="flex flex-wrap gap-2">
          <BotaoCopiar texto={linkTorcedor(gerado.token)} rotulo="Copiar link" />
          <BotaoCopiar texto={msg} rotulo="Copiar mensagem" />
          <BotaoWhatsApp link={linkWhatsApp(contato || null, msg)} />
          <Botao variante="fantasma" onClick={() => { setGerado(null); setPara(""); setContato(""); }}>Gerar outro</Botao>
        </div>
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-lg font-bold text-mrv-900">Link para convidados</h2>
      <p className="mb-3 text-sm text-tinta/60">Reserva os lugares e gera um link: o próprio convidado preenche nome, CPF e celular e entra aprovado. A vaga conta na cota desde já.</p>
      <div className="mb-3"><EscolhaAnfitriao anfitrioes={p.anfitrioes} valor={anfitriao} onChange={setAnfitriao} /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        {daLista ? <p className="self-center text-xs text-cinza sm:col-span-2">Setor e área seguem os do anfitrião escolhido.</p> : campos}
        <Campo rotulo="Quantos lugares" dica={!daLista && area ? `Saldo: ${saldo}` : undefined}>
          <Entrada type="number" min={1} max={10} value={qtd} onChange={(e) => setQtd(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} />
        </Campo>
        <Campo rotulo="Para quem (referência)"><Entrada value={para} onChange={(e) => setPara(e.target.value)} placeholder="Ex.: Convidados do cliente X" /></Campo>
        <Campo rotulo="WhatsApp (opcional)"><Entrada value={contato} onChange={(e) => setContato(e.target.value)} inputMode="tel" placeholder="(31) 9…" /></Campo>
      </div>
      {erro && <div className="mt-3"><Aviso tom="erro">{erro}</Aviso></div>}
      <Botao className="mt-3" disabled={pendente || (!daLista && !area) || anfitriaoIncompleto(anfitriao)}
        onClick={() => iniciar(async () => {
          setErro(null);
          const r = await gerarLinkConvidados(p.evento, { setor, area, qtd, para, contato, anfitriao });
          if (!r.ok) return setErro(r.erro);
          setGerado({ token: r.dados!.token, qtd, para, area: r.dados!.area, setor: r.dados!.setor });
        })}>
        {pendente ? "Gerando…" : `Gerar link (${qtd} lugar${qtd > 1 ? "es" : ""})`}
      </Botao>
    </div>
  );
}
