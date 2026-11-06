"use client";
// Nomes dos setores do evento aberto (ex.: "Cadeira Inferior" no lugar de "Pista"), para as telas cliente.
import { createContext, useContext } from "react";
import { rotuloSetor, rotuloSetorCurto, type NomesSetores, type Setor } from "@/lib/tipos";

const Contexto = createContext<NomesSetores>(null);

export function ProvedorSetores({ nomes, children }: { nomes: NomesSetores; children: React.ReactNode }) {
  return <Contexto.Provider value={nomes}>{children}</Contexto.Provider>;
}

/** Nomes do evento: rotulo("pista") → "Cadeira Inferior" (ou o padrão). */
export function useSetores() {
  const nomes = useContext(Contexto);
  return { rotulo: (s: Setor) => rotuloSetor(s, nomes), curto: (s: Setor) => rotuloSetorCurto(s, nomes) };
}

export function NomeSetor({ s, curto = false }: { s: Setor; curto?: boolean }) {
  const nomes = useContext(Contexto);
  return <>{curto ? rotuloSetorCurto(s, nomes) : rotuloSetor(s, nomes)}</>;
}
