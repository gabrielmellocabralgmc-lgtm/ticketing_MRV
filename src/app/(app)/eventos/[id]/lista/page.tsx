import Link from "next/link";
import { AoVivo } from "@/components/ao-vivo";
import { Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";
import { carregarEvento } from "../dados";
import { carregarIngressos } from "../ingressos";
import { desfazerEnvio, enviados, enviadosSemFacial, registrarCopia } from "../marketing-actions";
import { ListaGeral, type LinhaGeral } from "./lista-geral";

export const metadata = { title: "Lista geral" };

export default async function PaginaLista({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  const ev = await carregarEvento(id);
  const linhas = (await carregarIngressos(id, [
    "solicitado", "validado_area", "aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado", "presente",
    "lista_espera", "cancelado", "recusado", "no_show",
  ], "lista_geral")) as LinhaGeral[];
  return (
    <>
      <AoVivo evento={id} />
      <div className="mb-2 text-sm"><Link href={`/eventos/${id}`} className="text-mrv-700 hover:underline">← {ev.titulo}</Link></div>
      <Titulo
        sub="Todos os ingressos do evento numa tabela, como na planilha. Clique no CPF para copiar e marque “Enviado” na própria linha."
        acoes={<a href={`/eventos/${id}/exportar`} className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-semibold text-mrv-700 ring-1 ring-mrv-700/30 hover:bg-mrv-50">Exportar XLSX</a>}
      >
        Lista geral · {ev.titulo}
      </Titulo>
      <ListaGeral
        linhas={linhas}
        acoes={{
          enviados: enviados.bind(null, id),
          enviadosSemFacial: enviadosSemFacial.bind(null, id),
          desfazerEnvio: desfazerEnvio.bind(null, id),
          registrarCopia: registrarCopia.bind(null, id),
        }}
      />
    </>
  );
}
