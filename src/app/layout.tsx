import type { Metadata, Viewport } from "next";
import { Figtree, Saira } from "next/font/google";
import { CHAVE_ICONE, CHAVE_LOGO, imagensDisponiveis } from "@/lib/imagens";
import "./globals.css";

// Figtree: próxima da Averta (MRV, fonte paga); Saira: a do Galo ID
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const saira = Saira({ variable: "--font-saira", subsets: ["latin"], weight: ["500", "700", "800"] });

// Ícone da aba: o enviado em Aparência (ou o logo da MRV); sem nenhum, um ícone padrão
export async function generateMetadata(): Promise<Metadata> {
  const img = await imagensDisponiveis().catch(() => ({} as Record<string, string>));
  const icone = img[CHAVE_ICONE] ?? img[CHAVE_LOGO] ?? "/icone-padrao.svg";
  return {
    title: { default: "Ingressos MRV · Arena MRV", template: "%s · Ingressos MRV" },
    description: "Gestão dos ingressos de patrocínio da MRV na Arena MRV",
    icons: { icon: icone, apple: icone },
  };
}

export const viewport: Viewport = { themeColor: "#121212" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${figtree.variable} ${saira.variable} min-h-dvh antialiased`}>{children}</body>
    </html>
  );
}
