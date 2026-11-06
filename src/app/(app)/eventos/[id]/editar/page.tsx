import { EnviarImagem } from "@/components/enviar-imagem";
import { Cartao, Titulo } from "@/components/ui";
import { CHAVE_ESCUDO_ATLETICO, chaveCapaEvento, chaveEscudoAdversario, chaveMapaEvento, imagensDisponiveis } from "@/lib/imagens";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { atualizarEvento } from "../../actions";
import { FormEvento } from "../../form-evento";
import { carregarEvento } from "../dados";

export const metadata = { title: "Editar evento" };

export default async function EditarEvento({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  const ev = await carregarEvento(id);
  const img = await imagensDisponiveis();
  const { data: cam } = await (await supabaseServidor()).from("evento_setores").select("setor").eq("evento_id", id).eq("setor", "camarote").maybeSingle();
  return (
    <>
      <Titulo voltar={{ href: `/eventos/${id}`, rotulo: "Painel do jogo" }} sub="Cotas e capacidade se ajustam na página do evento (botão “Editar cotas”).">Editar {ev.titulo}</Titulo>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
        <Cartao>
          <FormEvento acao={atualizarEvento.bind(null, id)} evento={ev} temCamarote={!!cam} />
        </Cartao>
        <div className="space-y-6">
        <Cartao id="capa" className="h-fit">
          <h2 className="mb-1 font-bold">Capa do evento</h2>
          <p className="mb-4 text-sm text-cinza">Aparece no topo dos e-mails que o convidado recebe (convite, ingresso, avisos). Sem capa, o e-mail sai como antes.</p>
          <EnviarImagem chave={chaveCapaEvento(id)} url={img[chaveCapaEvento(id)]} rotulo="Capa do evento" formato="capa" dica="JPG ou PNG, de preferência horizontal (ex.: 1200 × 600)" />
        </Cartao>
        <Cartao id="mapa" className="h-fit">
          <h2 className="mb-1 font-bold">Mapa do evento</h2>
          <p className="mb-4 text-sm text-cinza">Vai nos e-mails dos gestores (convocação, lembrete e validação), com opção de ampliar. Sem mapa, o e-mail sai como antes.</p>
          <EnviarImagem chave={chaveMapaEvento(id)} url={img[chaveMapaEvento(id)]} rotulo="Mapa do evento" formato="mapa" dica="JPG ou PNG. Imagens grandes são reduzidas para até 1600 px." />
        </Cartao>
        {ev.tipo === "jogo" && <Cartao id="escudos" className="h-fit">
          <h2 className="mb-1 font-bold">Escudo do {ev.adversario ?? "adversário"}</h2>
          <p className="mb-4 text-sm text-cinza">Aparece no cabeçalho deste jogo, ao lado do escudo do Atlético.</p>
          <EnviarImagem chave={chaveEscudoAdversario(id)} url={img[chaveEscudoAdversario(id)]} rotulo={`Escudo ${ev.adversario ? `do ${ev.adversario}` : "do adversário"}`} formato="escudo" escuro dica="PNG transparente ou SVG" />
          {!img[CHAVE_ESCUDO_ATLETICO] && <p className="mt-4 text-xs text-cinza">O escudo do Atlético é enviado uma vez só, em Aparência.</p>}
        </Cartao>}
        </div>
      </div>
    </>
  );
}
