import { Titulo } from "@/components/ui";
import { CHAVE_LOGO, imagensDisponiveis } from "@/lib/imagens";
import { envioReal } from "@/lib/mensagens/envio";
import { exigirAdmin } from "@/lib/sessao";
import { supabaseServidor } from "@/lib/supabase/server";
import { EditorEmails, type Envio, type Modelo } from "./editor";

export const metadata = { title: "E-mails" };

export default async function Emails() {
  await exigirAdmin();
  const supabase = await supabaseServidor();
  const [{ data: modelos }, { data: envios }, img] = await Promise.all([
    supabase.from("modelos_email").select("chave, nome, descricao, assunto, corpo, atualizado_em").order("chave"),
    supabase.from("envios").select("id, tipo, para_nome, para_email, assunto, corpo, status, erro, criado_em").order("id", { ascending: false }).limit(300),
    imagensDisponiveis(),
  ]);
  const ordem = ["convocacao_area", "lembrete_area", "validacao_pendente", "convite_convidado", "galo_id", "ingresso_enviado", "lembrete_facial"];
  const lista = ((modelos ?? []) as Modelo[]).sort((a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave));
  return (
    <>
      <Titulo sub="Textos que o sistema manda às áreas e aos convidados. Remetente: naoresponda@ingressos.weareact3.com.">E-mails</Titulo>
      <EditorEmails modelos={lista} envios={(envios ?? []) as Envio[]} logoUrl={img[CHAVE_LOGO]} envioReal={envioReal()} />
    </>
  );
}
