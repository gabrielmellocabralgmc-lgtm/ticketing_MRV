"use client";
import { useState, useTransition } from "react";
import { Aviso, Botao, Campo, Entrada } from "@/components/ui";
import { cpfValido, formatarCpf, somenteDigitos } from "@/lib/cpf";
import { preencherConvite } from "./actions";

type P = { nome: string; cpf: string; celular: string; email: string };
const vazia = (): P => ({ nome: "", cpf: "", celular: "", email: "" });

function erros(p: P) {
  const e: Partial<Record<keyof P, string>> = {};
  if (p.nome.trim().split(/\s+/).length < 2) e.nome = "Informe o nome completo";
  if (!cpfValido(p.cpf)) e.cpf = "CPF inválido";
  const c = somenteDigitos(p.celular);
  if (c.length < 10 || c.length > 11) e.celular = "Celular com DDD";
  if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) e.email = "E-mail inválido";
  return e;
}

export function FormConvidado({ token, lugares, privacidade }: { token: string; lugares: number; privacidade: string }) {
  const [pessoas, setPessoas] = useState<P[]>(() => Array.from({ length: lugares }, vazia));
  const [aceite, setAceite] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const usadas = pessoas.filter((p, i) => i === 0 || p.nome || p.cpf || p.celular);
  const ok = usadas.every((p) => Object.keys(erros(p)).length === 0) && aceite;
  const set = (i: number, k: keyof P, v: string) => setPessoas((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        setTocado(true);
        if (!ok) return;
        iniciar(async () => {
          const r = await preencherConvite(token, usadas, aceite);
          if (!r.ok) setErro(r.erro);
        });
      }}
    >
      {pessoas.map((p, i) => {
        const e = tocado && (i === 0 || p.nome || p.cpf || p.celular) ? erros(p) : {};
        return (
          <fieldset key={i} className="space-y-3 rounded-xl p-4 ring-1 ring-black/10">
            <legend className="px-1 text-sm font-semibold text-mrv-900">{i === 0 ? "Seus dados" : `Acompanhante ${i}${i > 0 ? " (opcional)" : ""}`}</legend>
            <Campo rotulo="Nome completo" erro={e.nome}><Entrada value={p.nome} onChange={(ev) => set(i, "nome", ev.target.value)} autoComplete={i === 0 ? "name" : "off"} /></Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="CPF" erro={e.cpf} dica="O ingresso é emitido no CPF">
                <Entrada value={p.cpf} inputMode="numeric" onChange={(ev) => set(i, "cpf", ev.target.value)} onBlur={(ev) => somenteDigitos(ev.target.value).length >= 9 && set(i, "cpf", formatarCpf(ev.target.value))} />
              </Campo>
              <Campo rotulo="Celular (WhatsApp)" erro={e.celular}><Entrada value={p.celular} inputMode="tel" autoComplete={i === 0 ? "tel" : "off"} onChange={(ev) => set(i, "celular", ev.target.value)} /></Campo>
            </div>
            <Campo rotulo="E-mail (opcional)" erro={e.email}><Entrada type="email" value={p.email} autoComplete={i === 0 ? "email" : "off"} onChange={(ev) => set(i, "email", ev.target.value)} /></Campo>
          </fieldset>
        );
      })}
      <div className="rounded-xl bg-fundo p-4 text-xs leading-relaxed text-tinta/80">
        <p className="mb-2 font-semibold text-tinta">Aviso de privacidade (LGPD)</p>
        <p>{privacidade}</p>
        <label className="mt-3 flex items-start gap-2 text-sm text-tinta">
          <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5 size-4 accent-mrv-700" />
          Li e concordo com o uso dos meus dados{lugares > 1 ? " e dos meus acompanhantes" : ""} para a emissão do ingresso.
        </label>
        {tocado && !aceite && <p className="mt-1 text-red-700">É preciso aceitar para continuar.</p>}
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      <Botao type="submit" className="w-full" disabled={pendente}>{pendente ? "Enviando…" : "Enviar meus dados"}</Botao>
    </form>
  );
}
