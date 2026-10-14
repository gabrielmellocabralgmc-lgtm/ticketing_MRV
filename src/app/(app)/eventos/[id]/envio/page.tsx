import Link from "next/link";
import { AoVivo } from "@/components/ao-vivo";
import { Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";
import { carregarEvento } from "../dados";
import { carregarIngressos } from "../ingressos";
import { enviados, enviadosSemFacial, registrarCopia } from "../marketing-actions";
import { PainelEnvio } from "./painel-envio";

export const metadata = { title: "A enviar" };

export default async function Envio({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  const ev = await carregarEvento(id);
  const linhas = await carregarIngressos(id, ["aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado"], "envio");
  return (
    <>
      <AoVivo evento={id} />
      <div className="mb-2 text-sm"><Link href={`/eventos/${id}`} className="text-mrv-700 hover:underline">← {ev.titulo}</Link></div>
      <Titulo sub="Envio manual, um por vez: copie o CPF, envie no sistema do Atlético e marque “Enviado” aqui.">A enviar · {ev.titulo}</Titulo>
      <PainelEnvio
        linhas={linhas}
        evento={{ titulo: ev.titulo, inicio: ev.inicio, abertura_portoes: ev.abertura_portoes }}
        acoes={{ enviados: enviados.bind(null, id), enviadosSemFacial: enviadosSemFacial.bind(null, id), registrarCopia: registrarCopia.bind(null, id) }}
      />
    </>
  );
}
