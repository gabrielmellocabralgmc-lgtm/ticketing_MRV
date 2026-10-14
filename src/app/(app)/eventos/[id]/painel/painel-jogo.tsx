"use client";
// Painel do jogo (Marketing): um setor por aba, lista com o status de cada ingresso,
// lista de espera e "adicionar nomes" colando nome + CPF.
import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { BotaoCopiar } from "@/components/copiar";
import { AreaTexto, Aviso, Botao, Campo, Entrada, Selecao, Selo } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { dataHora } from "@/lib/formato";
import { separarLista } from "@/lib/parse-lista";
import { normalizarTexto } from "@/lib/texto";
import { ROTULO_SETOR, type Setor, type StatusIngresso } from "@/lib/tipos";
import { adicionarNomes, type ResultadoLinha } from "./actions";

export interface LinhaPainel {
  id: string;
  setor: Setor;
  area_nome: string;
  status: StatusIngresso;
  nome: string | null;
  cpf: string | null;
  convidado_de: string | null;
  convidado_de_nome: string | null;
  enviado_em: string | null;
  lista_espera_desde: string | null;
}

export interface SetorPainel {
  setor: Setor;
  capacidade: number;
  ocupados: number;
}

// Status em linguagem simples para quem só acompanha
const STATUS_SIMPLES: Partial<Record<StatusIngresso, { rotulo: string; tom: "cinza" | "azul" | "amarelo" | "verde" | "laranja" }>> = {
  solicitado: { rotulo: "Aguardando a área validar", tom: "cinza" },
  validado_area: { rotulo: "Aguardando aprovação", tom: "azul" },
  aprovado: { rotulo: "Aprovado · falta a facial", tom: "laranja" },
  facial_pendente: { rotulo: "Aprovado · falta a facial", tom: "laranja" },
  facial_ok: { rotulo: "Pronto para enviar", tom: "azul" },
  enviado: { rotulo: "Enviado", tom: "verde" },
  confirmado: { rotulo: "Recebido", tom: "verde" },
  presente: { rotulo: "Presente", tom: "verde" },
  lista_espera: { rotulo: "Lista de espera", tom: "amarelo" },
};
const ENVIADOS: StatusIngresso[] = ["enviado", "confirmado", "presente"];

export function PainelJogo({ evento, linhas, setores, areas, areaPadrao }: {
  evento: string; linhas: LinhaPainel[]; setores: SetorPainel[];
  areas: { id: string; nome: string }[]; areaPadrao: string;
}) {
  const [setor, setSetor] = useState<Setor>(setores.find((s) => s.setor === "arquibancada")?.setor ?? setores[0]?.setor ?? "arquibancada");
  const [busca, setBusca] = useState("");
  const [adicionando, setAdicionando] = useState(false);

  const doSetor = linhas.filter((l) => l.setor === setor);
  const ativos = doSetor.filter((l) => l.status !== "lista_espera");
  const espera = doSetor.filter((l) => l.status === "lista_espera").sort((a, b) => (a.lista_espera_desde ?? "").localeCompare(b.lista_espera_desde ?? ""));
  const filtrar = (ls: LinhaPainel[]) => {
    if (!busca) return ls;
    const b = normalizarTexto(busca);
    const d = busca.replace(/\D/g, "");
    return ls.filter((l) => normalizarTexto(l.nome).includes(b) || normalizarTexto(l.area_nome).includes(b) || (d.length >= 3 && (l.cpf ?? "").includes(d)));
  };
  const info = setores.find((s) => s.setor === setor);
  const enviados = ativos.filter((l) => ENVIADOS.includes(l.status)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {setores.map((s) => (
          <button key={s.setor} onClick={() => setSetor(s.setor)}
            aria-pressed={s.setor === setor}
            className={clsx("rounded-xl border px-[18px] py-3 text-left", s.setor === setor ? "border-mrv-700 bg-mrv-700 text-white" : "border-borda bg-white text-tinta hover:border-mrv-600")}>
            <div className="text-[15px] font-bold">{ROTULO_SETOR[s.setor].split(" ")[0]}</div>
            <div className={clsx("tabular text-[13px]", s.setor === setor ? "text-white/85" : "text-cinza")}>{s.ocupados} de {s.capacidade}</div>
          </button>
        ))}
        <Botao variante="laranja" className="ml-auto" onClick={() => setAdicionando((a) => !a)}>
          {adicionando ? "Fechar" : "+ Adicionar nomes"}
        </Botao>
      </div>

      {adicionando && (
        <AdicionarNomes evento={evento} setores={setores.map((s) => s.setor)} setorInicial={setor} areas={areas} areaPadrao={areaPadrao}
          aoConcluir={() => setAdicionando(false)} />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Grande rotulo="Ocupados" valor={`${info?.ocupados ?? 0} / ${info?.capacidade ?? 0}`} />
        <Grande rotulo="Enviados" valor={enviados} />
        <Grande rotulo="Ainda não enviados" valor={ativos.length - enviados} laranja={ativos.length - enviados > 0} />
        <Grande rotulo="Lista de espera" valor={espera.length} laranja={espera.length > 0} />
      </div>

      <div className="rounded-2xl border border-borda bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Lista · {ROTULO_SETOR[setor]}</h2>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <BotaoCopiar texto={filtrar(ativos).filter((l) => l.cpf).map((l) => `${l.nome}\t${formatarCpf(l.cpf)}`).join("\n")} rotulo="Copiar nomes e CPFs" />
            <div className="w-full sm:w-72"><Entrada value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, CPF ou área…" aria-label="Buscar" /></div>
          </div>
        </div>
        <TabelaSimples linhas={filtrar(ativos)} vazio="Ninguém neste setor ainda." />
      </div>

      {espera.length > 0 && (
        <div className="rounded-2xl border border-[#ffd9b3] bg-white p-5">
          <h2 className="mb-1 font-bold text-[#6b3a08]">Lista de espera · {ROTULO_SETOR[setor]}</h2>
          <p className="mb-3 text-sm text-[#8a4b0f]">Em ordem de chegada. Sobe sozinho quando abre vaga na área.</p>
          <TabelaSimples linhas={filtrar(espera)} posicao vazio="" />
        </div>
      )}
    </div>
  );
}

function Grande({ rotulo, valor, laranja }: { rotulo: string; valor: number | string; laranja?: boolean }) {
  return (
    <div className={clsx("rounded-2xl border p-5", laranja ? "border-[#ffd9b3] bg-laranja-100" : "border-borda bg-white")}>
      <div className={clsx("text-[13px] font-semibold", laranja ? "text-[#8a4b0f]" : "text-cinza")}>{rotulo}</div>
      <div className={clsx("tabular mt-1 font-display text-[40px] leading-tight font-bold", laranja ? "text-laranja-700" : "text-mrv-700")}>{valor}</div>
    </div>
  );
}

function TabelaSimples({ linhas, vazio, posicao }: { linhas: LinhaPainel[]; vazio: string; posicao?: boolean }) {
  if (!linhas.length) return vazio ? <p className="py-6 text-center text-sm text-tinta/50">{vazio}</p> : null;
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-xs tracking-wide text-tinta/60 uppercase">
            <th className="px-4 py-2">{posicao ? "Posição" : "#"}</th><th className="px-4 py-2">Nome</th><th className="px-4 py-2">CPF</th>
            <th className="px-4 py-2">Área</th><th className="px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => {
            const st = STATUS_SIMPLES[l.status] ?? { rotulo: l.status, tom: "cinza" as const };
            return (
              <tr key={l.id} className="border-t border-black/5">
                <td className="tabular px-4 py-2 text-xs text-tinta/40">{i + 1}</td>
                <td className={clsx("px-4 py-2", l.convidado_de ? "pl-8" : "font-medium")}>
                  {l.convidado_de && <span className="text-tinta/40">↳ </span>}{l.nome}
                  {l.convidado_de && <span className="block text-xs font-normal text-tinta/50">convidado de {l.convidado_de_nome}</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{l.cpf ? formatarCpf(l.cpf) : "—"}</td>
                <td className="px-4 py-2 text-xs">{l.area_nome}</td>
                <td className="px-4 py-2">
                  <Selo tom={st.tom}>{st.rotulo}</Selo>
                  {l.enviado_em && <span className="ml-1 text-xs text-tinta/50">{dataHora(l.enviado_em)}</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AdicionarNomes({ evento, setores, setorInicial, areas, areaPadrao, aoConcluir }: {
  evento: string; setores: Setor[]; setorInicial: Setor; areas: { id: string; nome: string }[]; areaPadrao: string; aoConcluir: () => void;
}) {
  const [setor, setSetor] = useState<Setor>(setorInicial);
  const [area, setArea] = useState(areaPadrao);
  const [texto, setTexto] = useState("");
  const [agrupar, setAgrupar] = useState(setorInicial === "camarote");
  const [resultado, setResultado] = useState<{ msg: string; linhas: ResultadoLinha[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const lidas = useMemo(() => separarLista(texto).map((l) => ({ ...l, problemas: l.problemas.filter((p) => p !== "sem celular") })), [texto]);
  const validas = lidas.filter((l) => !l.problemas.length);

  return (
    <div className="rounded-2xl bg-white p-4 ring-2 ring-laranja-500/40">
      <h2 className="font-bold text-mrv-900">Adicionar nomes</h2>
      <p className="mb-3 text-sm text-tinta/60">Cole uma pessoa por linha, com nome e CPF (pode vir do WhatsApp ou do Excel). Entram já aprovados.</p>
      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        <AreaTexto rows={8} value={texto} onChange={(e) => { setTexto(e.target.value); setResultado(null); }}
          placeholder={"Maria Souza 123.456.789-09\nJoão Lima; 98765432100"} aria-label="Nomes e CPFs" />
        <div className="space-y-3">
          <Campo rotulo="Setor">
            <Selecao value={setor} onChange={(e) => { setSetor(e.target.value as Setor); setAgrupar(e.target.value === "camarote"); }}>
              {setores.map((s) => <option key={s} value={s}>{ROTULO_SETOR[s]}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Conta na cota de qual área">
            <Selecao value={area} onChange={(e) => setArea(e.target.value)}>
              {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </Selecao>
          </Campo>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} className="mt-0.5 size-4 accent-mrv-700" />
            <span>A 1ª pessoa é o anfitrião e as demais são convidados dele</span>
          </label>
        </div>
      </div>

      {lidas.length > 0 && (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-fundo p-2 text-sm">
          {lidas.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span>
                {agrupar && i > 0 && <span className="text-tinta/40">↳ </span>}
                <b>{l.nome || "(sem nome)"}</b> <span className="font-mono text-xs text-tinta/60">{l.cpf ? formatarCpf(l.cpf) : ""}</span>
              </span>
              {l.problemas.length ? <Selo tom="vermelho">{l.problemas.join(", ")}</Selo> : <Selo tom="verde">ok</Selo>}
            </li>
          ))}
        </ul>
      )}

      {erro && <div className="mt-3"><Aviso tom="erro">{erro}</Aviso></div>}
      {resultado && (
        <div className="mt-3 space-y-2">
          <Aviso tom="ok">{resultado.msg}</Aviso>
          {resultado.linhas.filter((r) => !r.ok).map((r, i) => <Aviso key={i} tom="erro">{r.nome}: {r.erro}</Aviso>)}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Botao disabled={pendente || !validas.length || validas.length !== lidas.length}
          onClick={() => iniciar(async () => {
            setErro(null);
            const r = await adicionarNomes(evento, setor, area, validas.map((l) => ({ nome: l.nome, cpf: l.cpf! })), agrupar);
            if (!r.ok) return setErro(r.erro);
            setResultado({ msg: r.mensagem ?? "", linhas: r.dados ?? [] });
            if (r.dados?.every((x) => x.ok)) { setTexto(""); setTimeout(aoConcluir, 1500); }
          })}>
          {pendente ? "Adicionando…" : `Adicionar ${validas.length || ""} pessoa(s)`}
        </Botao>
        {lidas.length > validas.length && <span className="self-center text-xs text-red-700">Corrija as linhas marcadas para continuar.</span>}
      </div>
    </div>
  );
}
