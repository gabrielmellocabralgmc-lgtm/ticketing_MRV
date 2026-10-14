"use client";
// Operação do camarote: convidados aprovados, "Confirmar chegada" com horário, pessoa fora da lista
// e funcionamento com internet instável (confirmações ficam guardadas no celular e são enviadas depois).
import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Aviso, Botao, Campo, Entrada, Selecao, Selo } from "@/components/ui";
import { normalizarTexto } from "@/lib/texto";
import { registrarChegada, registrarWalkin } from "./actions";

export interface Convidado {
  ingresso_id: string;
  nome: string;
  cpf_mascarado: string | null;
  area: string;
  anfitriao: string;
  titular: boolean;
  pedido_id: string;
  indicacao_de: string | null;
  chegada_em: string | null;
}

export interface WalkinOperacao {
  id: string;
  nome: string;
  anfitriao: string | null;
  status: "pendente" | "aprovado" | "recusado";
  criado_em: string;
}

type Pendencia = { ingresso: string; chegou: boolean; em: string };

const hora = (iso: string) => new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(iso));

// fila de confirmações que não chegaram ao servidor (sem internet), guardada no celular
function lerFila(chave: string): Pendencia[] {
  try { return JSON.parse(localStorage.getItem(chave) ?? "[]"); } catch { return []; }
}
function gravarFila(chave: string, fila: Pendencia[]) {
  try { localStorage.setItem(chave, JSON.stringify(fila)); } catch { /* armazenamento indisponível */ }
}

export function ListaChegada({ evento, convidados, walkins }: { evento: string; convidados: Convidado[]; walkins: WalkinOperacao[] }) {
  const router = useRouter();
  const chaveFila = `chegadas-pendentes-${evento}`;
  const [chegadas, setChegadas] = useState<Record<string, string | null>>(() => Object.fromEntries(convidados.map((c) => [c.ingresso_id, c.chegada_em])));
  const [fila, setFila] = useState<Pendencia[]>([]);
  const [online, setOnline] = useState(true);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [foraDaLista, setForaDaLista] = useState(false);
  const [pendente, iniciar] = useTransition();

  // aplica por cima dos dados do servidor o que ainda está guardado no celular
  useEffect(() => {
    const guardadas = lerFila(chaveFila);
    setFila(guardadas);
    const base: Record<string, string | null> = Object.fromEntries(convidados.map((c) => [c.ingresso_id, c.chegada_em]));
    for (const p of guardadas) base[p.ingresso] = p.chegou ? p.em : null;
    setChegadas(base);
  }, [convidados, chaveFila]);

  const enviarFila = useCallback(async () => {
    const guardadas = lerFila(chaveFila);
    if (!guardadas.length) return;
    const restantes: Pendencia[] = [];
    for (const p of guardadas) {
      try {
        const r = await registrarChegada(p.ingresso, p.chegou, p.em);
        if (!r.ok) setErro(r.erro); // erro de regra: descarta (ex.: convidado removido da lista)
      } catch {
        restantes.push(p); // ainda sem conexão
      }
    }
    gravarFila(chaveFila, restantes);
    setFila(restantes);
    if (!restantes.length) router.refresh();
  }, [chaveFila, router]);

  useEffect(() => {
    const atualizarRede = () => setOnline(navigator.onLine);
    atualizarRede();
    const voltou = () => { atualizarRede(); enviarFila(); };
    window.addEventListener("online", voltou);
    window.addEventListener("offline", atualizarRede);
    const t = setInterval(() => { if (navigator.onLine) { enviarFila(); router.refresh(); } }, 20000);
    return () => { window.removeEventListener("online", voltou); window.removeEventListener("offline", atualizarRede); clearInterval(t); };
  }, [enviarFila, router]);

  const marcar = (c: Convidado, chegou: boolean) => {
    if (!chegou && !confirm(`Desfazer a chegada de ${c.nome}?`)) return;
    const antes = chegadas[c.ingresso_id];
    const em = new Date().toISOString();
    setChegadas((m) => ({ ...m, [c.ingresso_id]: chegou ? em : null }));
    iniciar(async () => {
      try {
        const r = await registrarChegada(c.ingresso_id, chegou, em);
        if (!r.ok) {
          setErro(r.erro);
          setChegadas((m) => ({ ...m, [c.ingresso_id]: antes }));
        } else {
          setErro(null);
          setChegadas((m) => ({ ...m, [c.ingresso_id]: r.dados?.em ?? null }));
        }
      } catch {
        // sem internet: guarda no celular e envia quando a conexão voltar
        const nova = [...lerFila(chaveFila).filter((p) => p.ingresso !== c.ingresso_id), { ingresso: c.ingresso_id, chegou, em }];
        gravarFila(chaveFila, nova);
        setFila(nova);
        setOnline(false);
      }
    });
  };

  const b = normalizarTexto(busca);
  const d = busca.replace(/\D/g, "");
  const visiveis = convidados.filter((c) => !b || normalizarTexto(c.nome).includes(b) || normalizarTexto(c.anfitriao).includes(b) || (d.length >= 3 && (c.cpf_mascarado ?? "").replace(/\D/g, "").includes(d)));
  const grupos = new Map<string, Convidado[]>();
  for (const c of visiveis) grupos.set(c.pedido_id, [...(grupos.get(c.pedido_id) ?? []), c]);
  const chegaram = convidados.filter((c) => chegadas[c.ingresso_id]).length;
  const anfitrioes = convidados.filter((c) => c.titular);
  const aguardandoMkt = walkins.filter((w) => w.status === "pendente");

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-4 space-y-3 bg-fundo px-4 pt-1 pb-3">
        <div className="flex items-end justify-between rounded-2xl bg-mrv-700 px-4 py-3 text-white">
          <div>
            <div className="text-xs tracking-wide uppercase opacity-80">Chegaram</div>
            <div className="tabular font-display text-3xl font-bold">{chegaram}<span className="text-lg opacity-70"> / {convidados.length}</span></div>
          </div>
          <div className="text-right text-xs opacity-80">{convidados.length - chegaram} ainda não chegaram</div>
        </div>
        {(!online || fila.length > 0) && (
          <Aviso tom="alerta">
            {online ? "Enviando" : "Sem internet."} {fila.length} confirmação(ões) guardada(s) neste celular{online ? "…" : ": serão enviadas quando a conexão voltar. Pode continuar confirmando."}
          </Aviso>
        )}
        <div className="flex gap-2">
          <Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, anfitrião ou CPF…" className="py-3 text-base" aria-label="Buscar convidado" />
          <Botao variante="secundario" className="shrink-0" onClick={() => setForaDaLista((f) => !f)}>{foraDaLista ? "Fechar" : "+ Fora da lista"}</Botao>
        </div>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>

      {foraDaLista && <FormForaDaLista evento={evento} anfitrioes={anfitrioes} aoConcluir={() => { setForaDaLista(false); router.refresh(); }} />}

      {walkins.length > 0 && (
        <section className="rounded-2xl border border-borda bg-white p-4 text-sm">
          <h2 className="mb-2 font-bold">Fora da lista</h2>
          <ul className="space-y-1.5">
            {walkins.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2">
                <span><b>{w.nome}</b> <span className="text-cinza">· recebido por {w.anfitriao ?? "?"}</span></span>
                <Selo tom={w.status === "pendente" ? "amarelo" : w.status === "aprovado" ? "verde" : "vermelho"}>
                  {w.status === "pendente" ? "Aguardando Marketing" : w.status === "aprovado" ? "Liberado" : "Recusado"}
                </Selo>
              </li>
            ))}
          </ul>
          {aguardandoMkt.length > 0 && <p className="mt-2 text-xs text-cinza">Avise o Marketing: a liberação aparece no painel do jogo.</p>}
        </section>
      )}

      {visiveis.length === 0 && <p className="py-8 text-center text-sm text-tinta/50">{convidados.length ? "Ninguém encontrado." : "Nenhum convidado aprovado para o camarote ainda."}</p>}

      {[...grupos.values()].map((g) => (
        <section key={g[0].pedido_id} className="overflow-hidden rounded-2xl border border-borda bg-white">
          <div className="border-b border-borda bg-mrv-50 px-4 py-2 text-xs">
            <span className="font-semibold text-mrv-700">Anfitrião: {g[0].anfitriao}</span>
            <span className="text-cinza"> · {g[0].area}{g[0].indicacao_de ? ` · indicação ${g[0].indicacao_de}` : ""}</span>
          </div>
          <ul className="divide-y divide-borda">
            {g.map((c) => {
              const em = chegadas[c.ingresso_id];
              const naoEnviada = fila.some((p) => p.ingresso === c.ingresso_id);
              return (
                <li key={c.ingresso_id} className={clsx("flex items-center gap-3 px-4 py-3", em && "bg-mrv-50/50")}>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium break-words">{c.nome}</div>
                    <div className="text-xs text-cinza">
                      {c.titular ? "Anfitrião" : `Convidado de ${c.anfitriao}`} · <span className="font-mono">{c.cpf_mascarado}</span>
                    </div>
                  </div>
                  {em ? (
                    <button onClick={() => marcar(c, false)} disabled={pendente} className="min-w-24 shrink-0 rounded-xl bg-mrv-700 px-3 py-2 text-center text-white">
                      <div className="text-sm font-semibold">✓ Chegou</div>
                      <div className="tabular text-xs opacity-85">{hora(em)}{naoEnviada ? " · no celular" : ""}</div>
                    </button>
                  ) : (
                    <button onClick={() => marcar(c, true)} disabled={pendente}
                      className="min-h-12 min-w-24 shrink-0 rounded-xl px-3 py-3 text-sm font-semibold text-mrv-700 ring-2 ring-mrv-600 active:bg-mrv-50">
                      Confirmar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function FormForaDaLista({ evento, anfitrioes, aoConcluir }: { evento: string; anfitrioes: Convidado[]; aoConcluir: () => void }) {
  const [d, setD] = useState({ nome: "", cpf: "", anfitriao: anfitrioes[0]?.ingresso_id ?? "", anfitriaoTexto: "", observacao: "" });
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <section className="space-y-3 rounded-2xl border-2 border-amarelo-500 bg-white p-4">
      <h2 className="font-bold">Pessoa fora da lista</h2>
      <p className="text-sm text-cinza">Registre aqui. O Marketing libera (ou não) a entrada no painel do jogo; liberada, ela já aparece como chegou.</p>
      <Campo rotulo="Nome completo"><Entrada value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} /></Campo>
      <Campo rotulo="CPF (se tiver)"><Entrada value={d.cpf} inputMode="numeric" onChange={(e) => setD({ ...d, cpf: e.target.value })} /></Campo>
      <Campo rotulo="Quem está recebendo">
        <Selecao value={d.anfitriao} onChange={(e) => setD({ ...d, anfitriao: e.target.value })}>
          {anfitrioes.map((a) => <option key={a.ingresso_id} value={a.ingresso_id}>{a.nome}</option>)}
          <option value="">Outra pessoa (digitar)</option>
        </Selecao>
      </Campo>
      {!d.anfitriao && <Campo rotulo="Nome de quem está recebendo"><Entrada value={d.anfitriaoTexto} onChange={(e) => setD({ ...d, anfitriaoTexto: e.target.value })} /></Campo>}
      <Campo rotulo="Observação"><Entrada value={d.observacao} onChange={(e) => setD({ ...d, observacao: e.target.value })} placeholder="ex.: veio com o anfitrião, filho do diretor" /></Campo>
      {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}
      <Botao className="w-full" disabled={pendente} onClick={() => iniciar(async () => {
        const r = await registrarWalkin(evento, { ...d, anfitriao: d.anfitriao || null });
        if (r.ok) aoConcluir(); else setRetorno({ ok: false, msg: r.erro });
      })}>{pendente ? "Registrando…" : "Pedir liberação ao Marketing"}</Botao>
    </section>
  );
}
