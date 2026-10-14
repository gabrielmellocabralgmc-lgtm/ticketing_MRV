import { BotaoAcao, FormAcao } from "@/components/form-acao";
import { Campo, Cartao, Entrada, Numero, Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { anonimizarAgora, anonimizarTitular, salvarRetencao } from "./actions";

export const metadata = { title: "Privacidade (LGPD)" };

export default async function Privacidade() {
  await exigirAdmin();
  const { data } = await (await supabaseServidor()).rpc("resumo_lgpd");
  const r = ((data ?? []) as { retencao_meses: number; pessoas_total: number; pessoas_anonimizadas: number; a_anonimizar: number }[])[0];
  return (
    <>
      <Titulo sub="Retenção dos dados pessoais (nome, CPF, celular, e-mail) e pedidos dos titulares. Métricas e históricos agregados continuam.">Privacidade (LGPD)</Titulo>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Retenção" valor={`${r?.retencao_meses ?? 12} meses`} />
        <Numero rotulo="Pessoas cadastradas" valor={r?.pessoas_total ?? 0} tom="cinza" />
        <Numero rotulo="Já anonimizadas" valor={r?.pessoas_anonimizadas ?? 0} tom="cinza" />
        <Numero rotulo="Vencidas (a anonimizar)" valor={r?.a_anonimizar ?? 0} tom={r?.a_anonimizar ? "laranja" : "cinza"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Cartao>
          <h2 className="mb-1 font-bold">Prazo de retenção</h2>
          <p className="mb-4 text-sm text-cinza">Depois desse prazo, contado do último jogo da pessoa, os dados pessoais são anonimizados automaticamente (rotina diária).</p>
          <FormAcao acao={salvarRetencao} rotulo="Salvar" limparAoConcluir={false}>
            <Campo rotulo="Meses após o último jogo"><Entrada name="meses" type="number" min={1} max={120} defaultValue={r?.retencao_meses ?? 12} required /></Campo>
          </FormAcao>
        </Cartao>
        <Cartao>
          <h2 className="mb-1 font-bold">Anonimizar agora</h2>
          <p className="mb-4 text-sm text-cinza">
            Aplica a retenção imediatamente: {r?.a_anonimizar ?? 0} pessoa(s) vencida(s), além de e-mails antigos da caixa de saída, entradas fora da lista e contatos de convites.
            Não dá para desfazer.
          </p>
          <BotaoAcao acao={anonimizarAgora} rotulo="Anonimizar vencidos" variante="perigo"
            confirmar="Anonimizar agora os dados vencidos? Nomes, CPFs, celulares e e-mails serão apagados e não dá para desfazer." />
        </Cartao>
        <Cartao>
          <h2 className="mb-1 font-bold">Pedido do titular</h2>
          <p className="mb-4 text-sm text-cinza">Quando alguém pede a exclusão dos próprios dados (LGPD, art. 18). Não funciona se a pessoa tiver ingresso ativo para jogo futuro.</p>
          <FormAcao acao={anonimizarTitular} rotulo="Anonimizar esta pessoa" variante="perigo" confirmar="Anonimizar os dados desta pessoa? Não dá para desfazer.">
            <Campo rotulo="CPF"><Entrada name="cpf" inputMode="numeric" required /></Campo>
          </FormAcao>
        </Cartao>
      </div>
    </>
  );
}
