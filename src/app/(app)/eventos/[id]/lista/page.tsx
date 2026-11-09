import { AoVivo } from "@/components/ao-vivo";
import { Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { carregarEvento } from "../dados";
import { carregarIngressos } from "../ingressos";
import { desfazerEnvio, enviados, enviadosSemFacial, facialOk, pendenteFacial, registrarCopia, validarIngressos } from "../marketing-actions";
import { ListaGeral, type LinhaGeral } from "./lista-geral";
import { atualizarDadosAdmin } from "../adicionar-actions";

export const metadata = { title: "Lista geral" };

export default async function PaginaLista({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdmin();
  const { id } = await params;
  const ev = await carregarEvento(id);
  const { data: digs } = ev.ingressos_digitais
    ? await (await supabaseServidor()).from("ingressos_digitais").select("ingresso_id, enviado_em").eq("evento_id", id)
    : { data: [] };
  const digitais = Object.fromEntries(((digs ?? []) as { ingresso_id: string | null; enviado_em: string | null }[])
    .filter((d) => d.ingresso_id).map((d) => [d.ingresso_id!, !!d.enviado_em]));
  const linhas = (await carregarIngressos(id, [
    "solicitado", "validado_area", "aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado", "presente",
    "lista_espera", "cancelado", "recusado", "no_show",
  ], "lista_geral")) as LinhaGeral[];
  return (
    <>
      <AoVivo evento={id} />
      <Titulo voltar={{ href: `/eventos/${id}`, rotulo: "Painel do evento" }}
        sub="Todos os ingressos do evento numa tabela, como na planilha. Clique no CPF para copiar e marque “Enviado” na própria linha."
        acoes={<a href={`/eventos/${id}/exportar`} className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-semibold text-mrv-700 ring-1 ring-mrv-700/30 hover:bg-mrv-50">Exportar XLSX</a>}
      >
        Lista geral · {ev.titulo}
      </Titulo>
      <ListaGeral
        linhas={linhas}
        acoes={{
          evento: { titulo: ev.titulo, inicio: ev.inicio, abertura_portoes: ev.abertura_portoes },
          facial: ev.exige_facial,
          digital: ev.ingressos_digitais,
          digitais,
          pendenteFacial: pendenteFacial.bind(null, id),
          facialOk: facialOk.bind(null, id),
          validar: validarIngressos.bind(null, id),
          enviados: enviados.bind(null, id),
          enviadosSemFacial: enviadosSemFacial.bind(null, id),
          desfazerEnvio: desfazerEnvio.bind(null, id),
          registrarCopia: registrarCopia.bind(null, id),
          atualizarDados: atualizarDadosAdmin.bind(null, id),
        }}
      />
    </>
  );
}
