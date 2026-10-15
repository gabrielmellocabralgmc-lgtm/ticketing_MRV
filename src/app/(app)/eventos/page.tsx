import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Escudo } from "@/components/jogo";
import { BotaoLink, Selo, Titulo, Vazio } from "@/components/ui";
import { CHAVE_ESCUDO_ATLETICO, chaveEscudoAdversario, imagensDisponiveis } from "@/lib/imagens";
import { dataLonga, dataHora } from "@/lib/formato";
import { exigirSessao } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { ROTULO_SETOR, ROTULO_STATUS_EVENTO, type Evento, type Setor } from "@/lib/tipos";

export const metadata: Metadata = { title: "Eventos" };

export default async function Eventos() {
  const s = await exigirSessao();
  if (s.papel === "operacao") redirect("/operacao");
  const supabase = await supabaseServidor();
  const { data } = await supabase.from("eventos").select("*").order("inicio", { ascending: false }).limit(60);
  const eventos = ((data ?? []) as Evento[]).filter((e) => s.staff || e.status !== "rascunho");
  // Staff vê o total do setor; responsável, só a cota das próprias áreas
  type Linha = { setor: Setor; rotulo: string; ocupados: number; capacidade: number; em_espera: number };
  const resumos = await Promise.all(
    eventos.map(async (e): Promise<readonly [string, Linha[]]> => {
      if (s.staff) {
        const { data: r } = await supabase.rpc("resumo_setores", { p_evento: e.id });
        return [e.id, ((r ?? []) as Omit<Linha, "rotulo">[]).map((x) => ({ ...x, rotulo: ROTULO_SETOR[x.setor] }))] as const;
      }
      const { data: r } = await supabase.rpc("resumo_evento", { p_evento: e.id });
      return [e.id, ((r ?? []) as { setor: Setor; area_nome: string; cota: number | null; ocupados: number; em_espera: number }[])
        .filter((x) => x.cota !== null)
        .map((x) => ({ setor: x.setor, rotulo: `${x.area_nome} · ${ROTULO_SETOR[x.setor].split(" ")[0]} (sua cota)`, ocupados: x.ocupados, capacidade: x.cota!, em_espera: x.em_espera }))] as const;
    }),
  );
  const porEvento = Object.fromEntries(resumos);
  const agora = Date.now();
  const proximos = eventos.filter((e) => new Date(e.inicio).getTime() >= agora - 6 * 3600e3).reverse();
  const passados = eventos.filter((e) => new Date(e.inicio).getTime() < agora - 6 * 3600e3);

  const img = await imagensDisponiveis();
  const statusTom = (e: Evento) => (e.status === "aberto" ? "verde" : e.status === "rascunho" ? "amarelo" : "cinza") as "verde" | "amarelo" | "cinza";

  // Próximos: card com faixa preta e escudos; anteriores: linha compacta
  const Cards = ({ itens }: { itens: Evento[] }) =>
    itens.length === 0 ? (
      <Vazio>Nenhum jogo programado.</Vazio>
    ) : (
      <div className="grid gap-5 md:grid-cols-2">
        {itens.map((e) => (
          <Link key={e.id} href={`/eventos/${e.id}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-borda bg-white transition hover:border-mrv-600 focus-visible:outline-2 focus-visible:outline-mrv-600">
            <div className="flex items-center gap-4 bg-preto p-5">
              <Escudo url={img[CHAVE_ESCUDO_ATLETICO]} nome="do Atlético" />
              <div className="min-w-0 flex-1 font-display text-[22px] leading-tight font-extrabold text-white uppercase">{e.titulo}</div>
              <Escudo url={img[chaveEscudoAdversario(e.id)]} nome={e.adversario ? `do ${e.adversario}` : "do adversário"} />
            </div>
            <div className="flex flex-1 flex-col gap-3.5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-cinza first-letter:uppercase">{dataLonga(e.inicio)}{e.competicao && ` · ${e.competicao}`}</span>
                <span className="flex gap-1.5">
                  
                  <Selo tom={statusTom(e)}>{ROTULO_STATUS_EVENTO[e.status]}</Selo>
                </span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2.5">
                {(porEvento[e.id] ?? []).map((r) => (
                  <div key={r.rotulo} className="rounded-xl bg-fundo px-3 py-2.5">
                    <div className="text-xs text-cinza">{r.rotulo}</div>
                    <div className="tabular font-display text-xl font-bold">{r.ocupados}<span className="text-sm text-[#8a8f8c]">/{r.capacidade}</span></div>
                    {r.em_espera > 0 && <div className="text-xs font-semibold text-laranja-700">{r.em_espera} em espera</div>}
                  </div>
                ))}
              </div>
              {e.prazo_solicitacao && e.status === "aberto" && <p className="text-xs text-cinza">Solicitações até {dataHora(e.prazo_solicitacao)}</p>}
            </div>
          </Link>
        ))}
      </div>
    );

  const Linhas = ({ itens }: { itens: Evento[] }) => (
    <div className="grid gap-3 md:grid-cols-2">
      {itens.map((e) => (
        <Link key={e.id} href={`/eventos/${e.id}`} className="flex items-center gap-4 rounded-2xl border border-borda bg-white px-5 py-4 hover:border-mrv-600">
          <Escudo url={img[chaveEscudoAdversario(e.id)]} nome={e.adversario ? `do ${e.adversario}` : "do adversário"} tamanho="p" escuro={false} />
          <div className="min-w-0">
            <div className="font-display text-[17px] font-bold uppercase">{e.titulo}</div>
            <div className="text-[13px] text-cinza first-letter:uppercase">{dataLonga(e.inicio)}{e.competicao && ` · ${e.competicao}`}</div>
          </div>
          <span className="ml-auto"><Selo tom={statusTom(e)}>{ROTULO_STATUS_EVENTO[e.status]}</Selo></span>
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <Titulo
        sub={s.staff ? "Jogos e shows na Arena MRV" : `Você responde por: ${s.areas.map((a) => a.nome).join(", ") || "nenhuma área"}`}
        acoes={s.papel === "admin" && <BotaoLink href="/eventos/novo" variante="primario">Novo evento</BotaoLink>}
      >
        {s.papel === "marketing" ? "Jogos" : "Eventos"}
      </Titulo>
      <h2 className="mb-3 font-display text-[13px] font-bold tracking-[0.08em] text-cinza">PRÓXIMOS</h2>
      <Cards itens={proximos} />
      {passados.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 font-display text-[13px] font-bold tracking-[0.08em] text-cinza">ANTERIORES</h2>
          <Linhas itens={passados} />
        </>
      )}
    </>
  );
}
