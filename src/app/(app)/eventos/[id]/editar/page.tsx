import { EnviarImagem } from "@/components/enviar-imagem";
import { Cartao, Titulo } from "@/components/ui";
import { CHAVE_ESCUDO_ATLETICO, chaveEscudoAdversario, imagensDisponiveis } from "@/lib/imagens";
import { exigirAdmin } from "@/lib/sessao";
import { atualizarEvento } from "../../actions";
import { FormEvento } from "../../form-evento";
import { carregarEvento } from "../dados";

export const metadata = { title: "Editar evento" };

export default async function EditarEvento({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  const ev = await carregarEvento(id);
  const img = await imagensDisponiveis();
  return (
    <>
      <Titulo voltar={{ href: `/eventos/${id}`, rotulo: "Painel do jogo" }} sub="Cotas e capacidade se ajustam na página do evento.">Editar {ev.titulo}</Titulo>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Cartao>
          <FormEvento acao={atualizarEvento.bind(null, id)} evento={ev} />
        </Cartao>
        <Cartao id="escudos" className="h-fit">
          <h2 className="mb-1 font-bold">Escudo do {ev.adversario ?? "adversário"}</h2>
          <p className="mb-4 text-sm text-cinza">Aparece no cabeçalho deste jogo, ao lado do escudo do Atlético.</p>
          <EnviarImagem chave={chaveEscudoAdversario(id)} url={img[chaveEscudoAdversario(id)]} rotulo={`Escudo ${ev.adversario ? `do ${ev.adversario}` : "do adversário"}`} formato="escudo" escuro dica="PNG transparente ou SVG" />
          {!img[CHAVE_ESCUDO_ATLETICO] && <p className="mt-4 text-xs text-cinza">O escudo do Atlético é enviado uma vez só, em Aparência.</p>}
        </Cartao>
      </div>
    </>
  );
}
