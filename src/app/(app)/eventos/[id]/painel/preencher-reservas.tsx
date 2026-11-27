"use client";
// Preencher reservas em massa: escolhe as reservas (de quem são) e cola a lista do WhatsApp/Excel.
// A 1ª pessoa da lista ocupa a 1ª reserva, e assim por diante. Tudo ou nada (ver preencher_reservas).
import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { Aviso, AreaTexto, Botao } from "@/components/ui";
import { formatarCpf } from "@/lib/cpf";
import { separarLista } from "@/lib/parse-lista";
import { preencherReservasEmMassa } from "../adicionar-actions";

export interface Reserva { id: string; para: string; area: string }

export function PreencherReservasEmMassa({ evento, reservas }: { evento: string; reservas: Reserva[] }) {
  const [aberto, setAberto] = useState(false);
  const [grupo, setGrupo] = useState("");
  const [texto, setTexto] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  // reservas agrupadas por "para quem" (+ área), na ordem da lista
  const grupos = useMemo(() => {
    const m = new Map<string, Reserva[]>();
    for (const r of reservas) {
      const k = `${r.para} · ${r.area}`;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m];
  }, [reservas]);
  const escolhidas = grupo === "" ? reservas : (grupos.find(([k]) => k === grupo)?.[1] ?? []);
  const pessoas = useMemo(() => separarLista(texto), [texto]);
  const sobra = pessoas.length - escolhidas.length;
  // celular é opcional aqui; só nome e CPF/passaporte travam
  const comProblema = pessoas.filter((p) => p.problemas.some((x) => x !== "sem celular"));
  const pode = pessoas.length > 0 && sobra <= 0 && comProblema.length === 0;

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-laranja-700/30 bg-laranja-100/40 px-5 py-3">
        <span className="text-sm">🔖 <b>{reservas.length}</b> reserva{reservas.length > 1 ? "s" : ""} sem nome neste setor.</span>
        <button onClick={() => { setAberto(true); setMsg(null); }}
          className="ml-auto rounded-lg bg-mrv-700 px-4 py-2 text-sm font-bold text-white hover:bg-mrv-600">Preencher reservas em massa</button>
        {msg && <div className="w-full"><Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso></div>}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-laranja-700/30 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-bold">Preencher reservas em massa</h3>
        <button onClick={() => setAberto(false)} className="ml-auto text-sm font-semibold text-mrv-700 hover:underline">Fechar</button>
      </div>

      <label className="block text-sm">
        <span className="font-semibold">Quais reservas?</span>
        <select value={grupo} onChange={(e) => setGrupo(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-borda bg-white px-3 py-2 text-sm sm:w-auto">
          <option value="">Todas as reservas deste setor ({reservas.length})</option>
          {grupos.map(([k, rs]) => <option key={k} value={k}>{k} ({rs.length})</option>)}
        </select>
      </label>

      <label className="block text-sm">
        <span className="font-semibold">Cole a lista: uma pessoa por linha, com nome e CPF</span>
        <AreaTexto rows={6} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder={"Maria da Silva 123.456.789-09\nJoão Souza; 98765432100; 31 99999-9999"} className="mt-1 font-mono text-xs" />
        <span className="text-xs text-tinta/60">Dá para colar do WhatsApp ou do Excel. Celular e e-mail são opcionais. A 1ª pessoa entra na 1ª reserva, e assim por diante.</span>
      </label>

      {pessoas.length > 0 && (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs tracking-wide text-tinta/60 uppercase">
                <th className="px-2 py-1">#</th><th className="px-2 py-1">Reserva</th><th className="px-2 py-1">Vai para</th><th className="px-2 py-1">CPF</th><th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p, i) => {
                const r = escolhidas[i];
                const probs = p.problemas.filter((x) => x !== "sem celular");
                return (
                  <tr key={i} className={clsx("border-t border-black/5", (!r || probs.length) && "bg-red-50")}>
                    <td className="tabular px-2 py-1 text-xs text-tinta/40">{i + 1}</td>
                    <td className="px-2 py-1 text-xs">{r ? <>🔖 {r.para}</> : <span className="font-semibold text-red-700">sem reserva sobrando</span>}</td>
                    <td className="px-2 py-1 font-medium">{p.nome || "—"}</td>
                    <td className="px-2 py-1 font-mono text-xs">{p.cpf ? formatarCpf(p.cpf) : "—"}</td>
                    <td className="px-2 py-1 text-xs text-red-700">{probs.join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sobra > 0 && <Aviso tom="erro">A lista tem {sobra} pessoa{sobra > 1 ? "s" : ""} a mais do que as reservas escolhidas. Tire {sobra > 1 ? "as linhas" : "a linha"} em vermelho ou escolha mais reservas.</Aviso>}
      {sobra < 0 && pessoas.length > 0 && <Aviso tom="info">{-sobra} reserva{-sobra > 1 ? "s continuam" : " continua"} guardada{-sobra > 1 ? "s" : ""} sem nome, para preencher depois.</Aviso>}
      {msg && <Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso>}

      <div className="flex gap-2">
        <Botao type="button" disabled={!pode || pendente} onClick={() => iniciar(async () => {
          setMsg(null);
          const r = await preencherReservasEmMassa(evento, escolhidas.slice(0, pessoas.length).map((x) => x.id),
            pessoas.map((p) => ({ nome: p.nome, cpf: p.cpf ?? "", celular: p.celular, email: p.email })));
          if (!r.ok) return setMsg({ ok: false, texto: r.erro });
          setTexto(""); setGrupo(""); setAberto(false);
          setMsg({ ok: true, texto: r.mensagem ?? "Reservas preenchidas." });
        })}>{pendente ? "Salvando…" : `Preencher ${Math.min(pessoas.length, escolhidas.length) || ""} reserva${pessoas.length === 1 ? "" : "s"}`}</Botao>
        <Botao type="button" variante="fantasma" onClick={() => setAberto(false)}>Voltar</Botao>
      </div>
    </div>
  );
}
