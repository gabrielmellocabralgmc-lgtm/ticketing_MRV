import { Cartao, Selo } from "@/components/ui";
import { supabaseServico } from "@/lib/supabase/server";
import { ROTULO_PAPEL, type Papel } from "@/lib/tipos";
import { entrarDemo } from "./actions";

/** Modo demonstração: lista os usuários (fictícios) do seed para entrar com um clique. */
export async function LoginDemo({ next }: { next: string }) {
  const sb = await supabaseServico();
  const [{ data: perfis }, { data: resp }] = await Promise.all([
    sb.from("perfis").select("user_id, nome, email, papel").eq("ativo", true).order("papel").order("nome"),
    sb.from("area_responsaveis").select("user_id, areas(nome)"),
  ]);
  const areas = (uid: string) => (resp ?? []).filter((r) => r.user_id === uid).map((r) => (r.areas as unknown as { nome: string }).nome).join(", ");
  return (
    <Cartao>
      <p className="mb-3 rounded-lg bg-amarelo-500/20 px-3 py-2 text-sm text-amber-900">
        <b>Modo demonstração.</b> Banco local com dados fictícios, sem envio de e-mail. Escolha com quem entrar:
      </p>
      <form action={entrarDemo} className="max-h-[60vh] space-y-1 overflow-y-auto">
        <input type="hidden" name="next" value={next} />
        {(perfis ?? []).map((p) => (
          <button key={p.user_id} name="usuario" value={p.user_id}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-mrv-50">
            <span>
              <span className="font-medium">{p.nome}</span>
              <span className="block text-xs text-tinta/60">{p.papel === "responsavel" ? areas(p.user_id) : p.email}</span>
            </span>
            <Selo tom={p.papel === "admin" ? "laranja" : p.papel === "marketing" ? "verde" : "cinza"}>{ROTULO_PAPEL[p.papel as Papel]}</Selo>
          </button>
        ))}
      </form>
    </Cartao>
  );
}
