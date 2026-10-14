import { Cartao, Titulo } from "@/components/ui";
import { exigirStaff } from "@/lib/sessao";
import { atualizarEvento } from "../../actions";
import { FormEvento } from "../../form-evento";
import { carregarEvento } from "../dados";

export const metadata = { title: "Editar evento" };

export default async function EditarEvento({ params }: { params: Promise<{ id: string }> }) {
  await exigirStaff();
  const { id } = await params;
  const ev = await carregarEvento(id);
  return (
    <>
      <Titulo sub="Cotas e capacidade se ajustam na página do evento.">Editar {ev.titulo}</Titulo>
      <Cartao className="max-w-3xl">
        <FormEvento acao={atualizarEvento.bind(null, id)} evento={ev} />
      </Cartao>
    </>
  );
}
