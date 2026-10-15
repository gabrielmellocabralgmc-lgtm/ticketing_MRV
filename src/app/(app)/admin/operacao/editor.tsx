"use client";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Aviso, Botao, Cartao, Entrada } from "@/components/ui";
import { salvarBebida, salvarItem, type BebidaForm, type ItemForm } from "./actions";

const novoItem = (momento: "antes" | "depois", ordem: number): ItemForm => ({ id: null, momento, secao: "", texto: "", dica: "", ordem, ativo: true });

export function EditorOperacao({ itens, bebidas }: { itens: ItemForm[]; bebidas: BebidaForm[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const rodar = (f: () => Promise<{ ok: boolean; mensagem?: string; erro?: string }>) =>
    iniciar(async () => { const r = await f(); setMsg({ ok: r.ok, texto: (r.ok ? r.mensagem : r.erro) ?? "" }); });

  return (
    <div className="space-y-6">
      {msg && <Aviso tom={msg.ok ? "ok" : "erro"}>{msg.texto}</Aviso>}
      {(["antes", "depois"] as const).map((m) => {
        const doMomento = itens.filter((i) => i.momento === m);
        return (
          <Cartao key={m}>
            <h2 className="mb-3 text-lg font-bold">Check-list {m === "antes" ? "antes do jogo" : "depois do jogo"}</h2>
            <div className="space-y-2">
              {doMomento.map((i) => <LinhaItem key={i.id} inicial={i} pendente={pendente} salvar={(x) => rodar(() => salvarItem(x))} />)}
              <LinhaItem key={`novo-${m}-${doMomento.length}`} inicial={novoItem(m, (doMomento.at(-1)?.ordem ?? 0) + 10)} pendente={pendente}
                salvar={(x) => rodar(() => salvarItem(x))} novo secoes={[...new Set(doMomento.map((i) => i.secao))]} />
            </div>
          </Cartao>
        );
      })}
      <Cartao>
        <h2 className="mb-3 text-lg font-bold">Bebidas controladas</h2>
        <div className="space-y-2">
          {bebidas.map((b) => <LinhaBebida key={b.id} inicial={b} pendente={pendente} salvar={(x) => rodar(() => salvarBebida(x))} />)}
          <LinhaBebida key={`nova-${bebidas.length}`} inicial={{ id: null, nome: "", unidade: "un.", ordem: (bebidas.at(-1)?.ordem ?? 0) + 10, ativo: true }}
            pendente={pendente} salvar={(x) => rodar(() => salvarBebida(x))} novo />
        </div>
      </Cartao>
    </div>
  );
}

function LinhaItem({ inicial, salvar, pendente, novo, secoes = [] }: {
  inicial: ItemForm; salvar: (i: ItemForm) => void; pendente: boolean; novo?: boolean; secoes?: string[];
}) {
  const [i, setI] = useState(inicial);
  const mudou = JSON.stringify(i) !== JSON.stringify(inicial);
  return (
    <div className={clsx("grid gap-2 rounded-xl p-2 sm:grid-cols-[140px_2fr_1.5fr_70px_auto_auto] sm:items-center", novo ? "bg-mrv-50/60" : "ring-1 ring-borda", !i.ativo && "opacity-50")}>
      <Entrada value={i.secao} onChange={(e) => setI({ ...i, secao: e.target.value })} placeholder="Seção (ex.: TVs)" list={novo ? `secoes-${i.momento}` : undefined} aria-label="Seção" />
      {novo && <datalist id={`secoes-${i.momento}`}>{secoes.map((s) => <option key={s} value={s} />)}</datalist>}
      <Entrada value={i.texto} onChange={(e) => setI({ ...i, texto: e.target.value })} placeholder={novo ? "Novo item do check-list" : "Item"} aria-label="Item" />
      <Entrada value={i.dica} onChange={(e) => setI({ ...i, dica: e.target.value })} placeholder="Dica (opcional)" aria-label="Dica" />
      <Entrada type="number" value={i.ordem} onChange={(e) => setI({ ...i, ordem: Number(e.target.value) })} aria-label="Ordem" title="Ordem" />
      {novo ? <span /> : (
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={i.ativo} onChange={(e) => setI({ ...i, ativo: e.target.checked })} className="accent-mrv-700" /> ativo</label>
      )}
      <Botao variante={novo ? "primario" : "secundario"} disabled={pendente || !mudou || !i.texto.trim() || !i.secao.trim()} onClick={() => salvar(i)}>{novo ? "Adicionar" : "Salvar"}</Botao>
    </div>
  );
}

function LinhaBebida({ inicial, salvar, pendente, novo }: { inicial: BebidaForm; salvar: (b: BebidaForm) => void; pendente: boolean; novo?: boolean }) {
  const [b, setB] = useState(inicial);
  const mudou = JSON.stringify(b) !== JSON.stringify(inicial);
  return (
    <div className={clsx("grid gap-2 rounded-xl p-2 sm:grid-cols-[2fr_1fr_70px_auto_auto] sm:items-center", novo ? "bg-mrv-50/60" : "ring-1 ring-borda", !b.ativo && "opacity-50")}>
      <Entrada value={b.nome} onChange={(e) => setB({ ...b, nome: e.target.value })} placeholder={novo ? "Nova bebida" : "Bebida"} aria-label="Bebida" />
      <Entrada value={b.unidade} onChange={(e) => setB({ ...b, unidade: e.target.value })} placeholder="Unidade (latas, litros…)" aria-label="Unidade" />
      <Entrada type="number" value={b.ordem} onChange={(e) => setB({ ...b, ordem: Number(e.target.value) })} aria-label="Ordem" title="Ordem" />
      {novo ? <span /> : (
        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={b.ativo} onChange={(e) => setB({ ...b, ativo: e.target.checked })} className="accent-mrv-700" /> ativa</label>
      )}
      <Botao variante={novo ? "primario" : "secundario"} disabled={pendente || !mudou || !b.nome.trim()} onClick={() => salvar(b)}>{novo ? "Adicionar" : "Salvar"}</Botao>
    </div>
  );
}
