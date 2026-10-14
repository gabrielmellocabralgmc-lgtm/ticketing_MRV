import { Selo } from "@/components/ui";
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
    <div>
      <p className="mb-3 rounded-lg bg-amarelo-100 px-3 py-2 text-sm text-[#5c4a00]">
        <b>Modo demonstração.</b> Banco local com dados fictícios, sem envio de e-mail. Escolha com quem entrar:
      </p>
      <form action={entrarDemo} className="max-h-[55vh] divide-y divide-borda overflow-y-auto rounded-xl border border-borda">
        <input type="hidden" name="next" value={next} />
        {(perfis ?? []).map((p) => (
          <button key={p.user_id} name="usuario" value={p.user_id}
            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-mrv-50">
            <span>
              <span className="font-medium">{p.nome}</span>
              <span className="block text-xs text-tinta/60">{p.papel === "responsavel" ? areas(p.user_id) : p.email}</span>
            </span>
            <Selo tom={p.papel === "admin" ? "laranja" : p.papel === "marketing" ? "verde" : "cinza"}>{ROTULO_PAPEL[p.papel as Papel]}</Selo>
          </button>
        ))}
      </form>
    </div>
  );
}
