import Link from "next/link";
import { Titulo } from "@/components/ui";
import { exigirAdmin } from "@/lib/sessao";

export const metadata = { title: "Configurações" };

const ITENS = [
  { href: "/admin/areas", titulo: "Áreas e responsáveis", texto: "Áreas, centros de custo e quem responde por cada uma." },
  { href: "/admin/usuarios", titulo: "Usuários", texto: "Perfis de acesso: Admin, Marketing, responsáveis e operação." },
  { href: "/admin/emails", titulo: "E-mails", texto: "Textos enviados às áreas e aos convidados, e a caixa de saída." },
  { href: "/admin/aparencia", titulo: "Aparência", texto: "Logo da MRV, foto do login e escudo do Atlético." },
  { href: "/admin/operacao", titulo: "Operação do camarote", texto: "Itens dos check-lists (antes e depois do jogo) e bebidas controladas." },
  { href: "/admin/importar", titulo: "Importar", texto: "Planilha de controle antiga e respostas do Microsoft Forms." },
  { href: "/admin/privacidade", titulo: "Privacidade (LGPD)", texto: "Prazo de retenção, anonimização e pedidos dos titulares." },
  { href: "/admin/auditoria", titulo: "Auditoria", texto: "Quem viu, copiou, exportou ou alterou dados pessoais." },
];

export default async function Configuracoes() {
  await exigirAdmin();
  return (
    <>
      <Titulo>Configurações</Titulo>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ITENS.map((i) => (
          <Link key={i.href} href={i.href} className="rounded-2xl border border-borda bg-white p-5 transition hover:border-mrv-600">
            <h2 className="font-bold">{i.titulo}</h2>
            <p className="mt-1 text-sm text-cinza">{i.texto}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
