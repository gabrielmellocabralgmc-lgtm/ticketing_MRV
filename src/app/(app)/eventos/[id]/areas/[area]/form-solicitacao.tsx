"use client";
import { useState, useTransition } from "react";
import { AreaTexto, Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { cpfValido, formatarCpf, somenteDigitos } from "@/lib/cpf";
import { separarLista } from "@/lib/parse-lista";
import type { Setor } from "@/lib/tipos";
import { solicitar, type PessoaForm } from "./actions";

const vazia = (): PessoaForm => ({ nome: "", cpf: "", celular: "", email: "" });

function problemas(p: PessoaForm) {
  const e: Partial<Record<keyof PessoaForm, string>> = {};
  if (p.nome.trim().split(/\s+/).length < 2) e.nome = "Nome completo";
  if (!p.cpf) e.cpf = "Obrigatório";
  else if (!cpfValido(p.cpf)) e.cpf = "CPF inválido";
  const cel = somenteDigitos(p.celular);
  if (cel.length < 10 || cel.length > 11) e.celular = "DDD + número";
  if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) e.email = "E-mail inválido";
  return e;
}

export function FormSolicitacao({ evento, setor, area, saldo, padraoConvidados }: { evento: string; setor: Setor; area: string; saldo: number; padraoConvidados: number }) {
  const [pessoas, setPessoas] = useState<PessoaForm[]>(() => Array.from({ length: 1 + padraoConvidados }, vazia));
  const [tocado, setTocado] = useState(false);
  const [colar, setColar] = useState(false);
  const [texto, setTexto] = useState("");
  const [retorno, setRetorno] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const preenchidas = pessoas.filter((p, i) => i === 0 || p.nome || p.cpf || p.celular);
  const erros = preenchidas.map(problemas);
  const valido = erros.every((e) => Object.keys(e).length === 0);
  const cpfs = preenchidas.map((p) => somenteDigitos(p.cpf).padStart(11, "0"));
  const repetido = cpfs.some((c, i) => c !== "00000000000" && cpfs.indexOf(c) !== i);
  // Sem saldo para o pedido inteiro: só dá para entrar na lista de espera (sem garantia)
  const excede = preenchidas.length > saldo;

  const set = (i: number, campo: keyof PessoaForm, v: string) => setPessoas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));

  const enviar = () => {
    setTocado(true);
    if (!valido || repetido) return;
    iniciar(async () => {
      const r = await solicitar(evento, setor, area, preenchidas, excede);
      if (r.ok) {
        setRetorno({ ok: true, msg: r.mensagem ?? "Pronto." });
        setPessoas(Array.from({ length: 1 + padraoConvidados }, vazia));
        setTocado(false);
      } else setRetorno({ ok: false, msg: r.erro });
    });
  };

  const aplicarColagem = () => {
    const lidas = separarLista(texto);
    if (!lidas.length) return;
    setPessoas(lidas.map((l) => ({ nome: l.nome, cpf: l.cpf ? formatarCpf(l.cpf) : "", celular: l.celular ?? "", email: l.email ?? "" })));
    setColar(false);
    setTexto("");
    setTocado(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-tinta/70">A 1ª pessoa é o titular (colaborador); as demais ficam como convidadas dele.</p>
        <button type="button" onClick={() => setColar((c) => !c)} className="text-sm font-semibold text-mrv-700 hover:underline">
          {colar ? "Fechar" : "Colar lista (WhatsApp/Excel)"}
        </button>
      </div>
      {colar && (
        <div className="space-y-2 rounded-xl bg-mrv-50 p-3">
          <AreaTexto rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Uma pessoa por linha: nome, CPF e celular\nMaria Souza; 123.456.789-09; (31) 99999-0000"} />
          <Botao type="button" variante="secundario" onClick={aplicarColagem}>Separar em linhas</Botao>
        </div>
      )}
      {pessoas.map((p, i) => {
        const e = tocado && (i === 0 || p.nome || p.cpf || p.celular) ? problemas(p) : {};
        return (
          <fieldset key={i} className="rounded-xl p-3 ring-1 ring-black/10">
            <legend className="px-1 text-xs font-semibold tracking-wide text-tinta/60 uppercase">{i === 0 ? "Titular" : `Convidado ${i}`}</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1.4fr_auto]">
              <Campo rotulo="Nome completo" erro={e.nome}><Entrada value={p.nome} onChange={(ev) => set(i, "nome", ev.target.value)} autoComplete="off" /></Campo>
              <Campo rotulo="CPF" erro={e.cpf}>
                <Entrada value={p.cpf} inputMode="numeric" onChange={(ev) => set(i, "cpf", ev.target.value)}
                  onBlur={(ev) => somenteDigitos(ev.target.value).length >= 9 && set(i, "cpf", formatarCpf(ev.target.value))} />
              </Campo>
              <Campo rotulo="Celular (WhatsApp)" erro={e.celular}><Entrada value={p.celular} inputMode="tel" onChange={(ev) => set(i, "celular", ev.target.value)} placeholder="(31) 9…" /></Campo>
              <Campo rotulo="E-mail (opcional)" erro={e.email}><Entrada value={p.email} type="email" onChange={(ev) => set(i, "email", ev.target.value)} /></Campo>
              {i > 0 && (
                <button type="button" aria-label="Remover" onClick={() => setPessoas((ps) => ps.filter((_, j) => j !== i))} className="self-end pb-2 text-sm text-tinta/50 hover:text-red-700">
                  Remover
                </button>
              )}
            </div>
          </fieldset>
        );
      })}
      <div className="flex flex-wrap items-center gap-4">
        <Botao type="button" variante="fantasma" onClick={() => setPessoas((ps) => [...ps, vazia()])} disabled={pessoas.length >= 20}>+ Convidado</Botao>
      </div>
      {excede && (
        <Aviso tom="alerta">
          <p className="font-semibold">{saldo === 0 ? "A cota da sua área acabou." : `Sua área tem só ${saldo} ingresso(s) de saldo e este pedido tem ${preenchidas.length}.`}</p>
          <p className="mt-1">
            Você pode adicionar à <b>lista de espera</b>, mas <b>não é garantia</b>: a vaga só é liberada se sobrarem ingressos
            não usados por outras áreas ou se houver cancelamentos, a critério do Marketing MRV. Se for liberado, o pedido aparece
            nesta lista como “Solicitado”.
          </p>
        </Aviso>
      )}
      {tocado && repetido && <Aviso tom="erro">O mesmo CPF aparece duas vezes neste pedido.</Aviso>}
      {retorno && <Aviso tom={retorno.ok ? "ok" : "erro"}>{retorno.msg}</Aviso>}
      <Botao type="button" variante={excede ? "laranja" : "primario"} onClick={enviar} disabled={pendente}>
        {pendente ? "Enviando…" : excede ? `Adicionar ${preenchidas.length} à lista de espera` : `Solicitar ${preenchidas.length} ingresso(s)`}
      </Botao>
      <p className="text-xs text-tinta/60">
        Ao enviar, você confirma que as pessoas foram informadas de que a MRV usará nome, CPF e celular só para emitir o ingresso e orientar o cadastro no Galo ID.
      </p>
    </div>
  );
}
