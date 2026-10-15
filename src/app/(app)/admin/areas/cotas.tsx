import { FormAcao } from "@/components/form-acao";
import { Cartao, Entrada } from "@/components/ui";
import { salvarCotasPadrao } from "./actions";

type Valor = number | { quantidade: number; sob_demanda?: boolean };
export interface Padrao {
  jogo: { camarote: { capacidade: number }; arquibancada: { capacidade: number; areas: Record<string, Valor> } };
  show: { camarote: { capacidade: number }; pista: { capacidade: number; areas: Record<string, Valor> } };
}

const qtd = (v: Valor | undefined) => (v === undefined ? 0 : typeof v === "object" ? v.quantidade : v);

/** Tabela das cotas padrão por área (jogo: arquibancada; show: pista) e capacidades. */
export function CotasPadrao({ padrao, areas }: { padrao: Padrao; areas: { slug: string; nome: string }[] }) {
  const somaJogo = areas.reduce((n, a) => n + qtd(padrao.jogo.arquibancada.areas[a.slug]), 0);
  const somaShow = areas.reduce((n, a) => n + qtd(padrao.show.pista.areas[a.slug]), 0);
  return (
    <Cartao className="mb-6">
      <h2 className="mb-1 font-bold">Cotas padrão</h2>
      <p className="mb-4 text-sm text-cinza">
        Aplicadas a cada evento novo (o regulamento é o ponto de partida). Para mudar um jogo já criado, use <b>Ajustar cota</b> na página do jogo.
      </p>
      <FormAcao acao={salvarCotasPadrao} rotulo="Salvar cotas padrão" limparAoConcluir={false}>
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-[#fafafa] text-left text-xs tracking-wide text-cinza uppercase">
                <th className="px-5 py-2">Área</th><th className="px-3 py-2 text-right">Jogos · Arquibancada</th><th className="px-5 py-2 text-right">Shows · Pista</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => {
                const pista = padrao.show.pista.areas[a.slug];
                return (
                  <tr key={a.slug} className="border-t border-[#edeeed]">
                    <td className="px-5 py-1.5">{a.nome}{typeof pista === "object" && pista.sob_demanda && <span className="ml-1 text-xs text-cinza">(pista sob demanda)</span>}</td>
                    <td className="px-3 py-1.5"><div className="ml-auto w-24"><Entrada name={`cota-jogo-${a.slug}`} type="number" min={0} defaultValue={qtd(padrao.jogo.arquibancada.areas[a.slug])} className="text-right" aria-label={`${a.nome}: cota de arquibancada`} /></div></td>
                    <td className="px-5 py-1.5"><div className="ml-auto w-24"><Entrada name={`cota-show-${a.slug}`} type="number" min={0} defaultValue={qtd(pista)} className="text-right" aria-label={`${a.nome}: cota de pista`} /></div></td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-tinta/20 font-semibold">
                <td className="px-5 py-2">Soma das áreas</td><td className="tabular px-3 py-2 text-right">{somaJogo}</td><td className="tabular px-5 py-2 text-right">{somaShow}</td>
              </tr>
              <tr className="border-t border-[#edeeed]">
                <td className="px-5 py-1.5">Capacidade do setor</td>
                <td className="px-3 py-1.5"><div className="ml-auto w-24"><Entrada name="cap-jogo-arquibancada" type="number" min={0} defaultValue={padrao.jogo.arquibancada.capacidade} className="text-right" aria-label="Capacidade da arquibancada" /></div></td>
                <td className="px-5 py-1.5"><div className="ml-auto w-24"><Entrada name="cap-show-pista" type="number" min={0} defaultValue={padrao.show.pista.capacidade} className="text-right" aria-label="Capacidade da pista" /></div></td>
              </tr>
              <tr className="border-t border-[#edeeed]">
                <td className="px-5 py-1.5">Camarote <span className="text-xs text-cinza">(sem cota por área; gestão manual pelo Marketing)</span></td>
                <td className="px-3 py-1.5"><div className="ml-auto w-24"><Entrada name="cap-jogo-camarote" type="number" min={0} defaultValue={padrao.jogo.camarote.capacidade} className="text-right" aria-label="Capacidade do camarote em jogos" /></div></td>
                <td className="px-5 py-1.5"><div className="ml-auto w-24"><Entrada name="cap-show-camarote" type="number" min={0} defaultValue={padrao.show.camarote.capacidade} className="text-right" aria-label="Capacidade do camarote em shows" /></div></td>
              </tr>
            </tbody>
          </table>
        </div>
      </FormAcao>
    </Cartao>
  );
}
