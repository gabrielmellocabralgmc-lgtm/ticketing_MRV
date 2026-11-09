import { Aviso, BotaoLink, Titulo } from "@/components/ui";
import { exigirStaff } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Setor, StatusIngresso } from "@/lib/tipos";
import { carregarEvento } from "../dados";
import { carregarIngressos } from "../ingressos";
import { PainelDigitais, type Digital, type Convidado } from "./painel";

export const metadata = { title: "Ingressos digitais" };

/** Link de uso único nunca vai para o navegador da equipe: "www.eventim.com.br/…cdef" */
function mascarar(u: string | null) {
  if (!u) return null;
  try { return `${new URL(u).host}/…${u.slice(-4)}`; } catch { return "link"; }
}

export default async function IngressosDigitais({ params }: { params: Promise<{ id: string }> }) {
  const s = await exigirStaff();
  const { id } = await params;
  const ev = await carregarEvento(id);
  const voltar = { href: s.papel === "admin" ? `/eventos/${id}` : `/eventos/${id}/painel`, rotulo: "Painel do evento" };
  if (!ev.ingressos_digitais) {
    return (
      <>
        <Titulo voltar={voltar}>Ingressos digitais · {ev.titulo}</Titulo>
        <Aviso tom="info">Este evento não usa ingressos digitais. Para ativar, edite o evento e marque “Ingressos digitais enviados pelo sistema”.</Aviso>
        {s.papel === "admin" && <div className="mt-4"><BotaoLink href={`/eventos/${id}/editar`}>Editar evento</BotaoLink></div>}
      </>
    );
  }
  const supabase = await supabaseServidor();
  const [{ data: setoresRows }, { data: digitais }, convidados] = await Promise.all([
    supabase.from("evento_setores").select("setor").eq("evento_id", id),
    supabase.from("ingressos_digitais").select("id, setor, tipo, url, nome_arquivo, titular_nome, titular_cpf, ingresso_id, atribuido_em, enviado_em, criado_em, resgate_aberto_em, resgate_vezes").eq("evento_id", id).order("ordem"),
    carregarIngressos(id, ["aprovado", "facial_pendente", "facial_ok", "enviado", "confirmado", "presente"], "ingressos_digitais"),
  ]);
  const ordem: Setor[] = ["pista", "camarote", "arquibancada"];
  const setores = ((setoresRows ?? []).map((r) => r.setor as Setor)).sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b));

  return (
    <>
      <Titulo voltar={voltar}
        sub="Suba os ingressos (PDF ou link), distribua entre os convidados prontos para envio e envie por e-mail. O ingresso também fica na página pessoal de cada convidado.">
        Ingressos digitais · {ev.titulo}
      </Titulo>
      {ev.resgate_unico && (
        <div className="mb-4"><Aviso tom="alerta">
          <b>Link de resgate de uso único.</b> Cole os links da Eventim normalmente. Eles ficam ocultos e a equipe não consegue abri-los, para não consumir o ingresso.
          O e-mail leva o convidado à página pessoal, onde ele lê o passo a passo e resgata uma única vez. A coluna “Situação” mostra quando cada um resgatou.
        </Aviso></div>
      )}
      <PainelDigitais evento={id} resgate={!!ev.resgate_unico} setores={setores} digitais={((digitais ?? []) as Digital[]).map((d) => (ev.resgate_unico && d.tipo === "link" ? { ...d, url: mascarar(d.url) } : d))}
        convidados={(convidados as unknown as (Convidado & { status: StatusIngresso })[]).map((c) => ({
          id: c.id, nome: c.nome, cpf: c.cpf, email: c.email, setor: c.setor, status: c.status, area_nome: c.area_nome, token: c.token,
        }))} />
    </>
  );
}
