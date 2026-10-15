import Link from "next/link";
import { AoVivo } from "@/components/ao-vivo";
import { BotaoAcao } from "@/components/form-acao";
import { Cartao, Tabela, Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";
import { ROTULO_SETOR } from "@/lib/tipos";
import { carregarEvento, carregarResumo } from "../dados";
import { carregarIngressos } from "../ingressos";
import { aprovar, cancelarMarketing, facialOk, promover, recusar, validarComoMarketing } from "../marketing-actions";
import { TabelaSelecao } from "../tabela-selecao";

export const metadata = { title: "Aprovação" };

export default async function Aprovacao({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  const ev = await carregarEvento(id);
  const [{ linhas: resumo }, ingressos] = await Promise.all([
    carregarResumo(id),
    carregarIngressos(id, ["validado_area", "lista_espera", "aprovado", "facial_pendente"], "aprovacao"),
  ]);
  const info = { titulo: ev.titulo, inicio: ev.inicio, abertura_portoes: ev.abertura_portoes };
  const validados = ingressos.filter((i) => i.status === "validado_area");
  const espera = ingressos.filter((i) => i.status === "lista_espera");
  const aprovados = ingressos.filter((i) => i.status === "aprovado" || i.status === "facial_pendente");
  const naoValidadas = resumo.filter((r) => r.solicitados > 0);

  return (
    <>
      <AoVivo evento={id} />
      <div className="mb-2 text-sm"><Link href={`/eventos/${id}`} className="text-mrv-700 hover:underline">← {ev.titulo}</Link></div>
      <Titulo voltar={{ href: `/eventos/${id}`, rotulo: "Painel do jogo" }} sub="Valide em nome da área se precisar, acompanhe quem está com a facial pendente e a lista de espera.">Aprovação · {ev.titulo}</Titulo>

      {naoValidadas.length > 0 && (
        <Cartao className="mb-6">
          <h2 className="mb-1 font-bold text-mrv-900">Listas ainda não validadas pelas áreas</h2>
          <p className="mb-3 text-sm text-tinta/60">Só chegam para aprovação depois que o responsável clica em “Validar lista”.</p>
          <Tabela>
            <thead><tr><th>Área</th><th>Setor</th><th className="text-right">A validar</th><th /></tr></thead>
            <tbody>
              {naoValidadas.map((r) => (
                <tr key={`${r.setor}-${r.area_id}`}>
                  <td className="font-medium"><Link className="hover:underline" href={`/eventos/${id}/areas/${r.area_id}?setor=${r.setor}`}>{r.area_nome}</Link></td>
                  <td>{ROTULO_SETOR[r.setor]}</td>
                  <td className="tabular text-right">{r.solicitados}</td>
                  <td className="text-right">
                    <BotaoAcao acao={validarComoMarketing.bind(null, id, r.setor, r.area_id)} rotulo="Validar pela área"
                      confirmar={`Validar ${r.solicitados} ingresso(s) de ${r.area_nome} em nome da área?`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Cartao>
      )}

      <Cartao className="mb-6">
        <h2 className="mb-3 font-bold text-mrv-900">Aguardando aprovação ({validados.length})</h2>
        <TabelaSelecao
          linhas={validados}
          evento={info}
          vazio="Nenhuma lista validada esperando aprovação."
          acoes={[
            { rotulo: "Aprovar selecionados", variante: "primario", executar: aprovar.bind(null, id) },
            { rotulo: "Recusar", variante: "perigo", pedirMotivo: "Motivo da recusa (fica no histórico):", executar: recusar.bind(null, id) },
          ]}
        />
      </Cartao>

      <Cartao className="mb-6">
        <h2 className="mb-1 font-bold text-mrv-900">Pendente facial ({aprovados.length})</h2>
        <p className="mb-3 text-sm text-cinza">
          Sinalizados sem facial no sistema do Atlético. Quem tem e-mail já recebeu o passo a passo; para os demais, use o botão do WhatsApp.
          Quando a pessoa confirma pelo link, volta sozinha para “Pronto para envio”.
        </p>
        <TabelaSelecao
          linhas={aprovados}
          evento={info}
          mensagem="galo_id"
          vazio="Ninguém aprovado aguardando a facial."
          acoes={[
            { rotulo: "Facial OK (liberar)", variante: "primario", confirmar: "Confirmar que {n} pessoa(s) já têm a facial cadastrada?", executar: facialOk.bind(null, id) },
            { rotulo: "Cancelar", variante: "perigo", pedirMotivo: "Motivo do cancelamento:", executar: cancelarMarketing.bind(null, id) },
          ]}
        />
      </Cartao>

      <Cartao>
        <h2 className="mb-1 font-bold text-mrv-900">Lista de espera ({espera.length})</h2>
        <p className="mb-3 text-sm text-tinta/60">Sobe automaticamente quando abre vaga na área. Para liberar agora, remaneje a cota na página do evento e clique em promover.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {[...new Map(espera.map((e) => [`${e.setor}|${e.area_id}`, e])).values()].map((e) => (
            <BotaoAcao key={`${e.setor}-${e.area_id}`} acao={promover.bind(null, id, e.setor, e.area_id)} rotulo={`Promover ${e.area_nome} (${ROTULO_SETOR[e.setor]})`} />
          ))}
        </div>
        <TabelaSelecao
          linhas={espera}
          evento={info}
          vazio="Lista de espera vazia."
          acoes={[{ rotulo: "Recusar", variante: "perigo", pedirMotivo: "Motivo:", executar: recusar.bind(null, id) }]}
        />
      </Cartao>
    </>
  );
}
