import { EnviarImagem } from "@/components/enviar-imagem";
import { Cartao, Titulo } from "@/components/ui";
import { CHAVE_ESCUDO_ATLETICO, CHAVE_ICONE, CHAVE_LOGIN, CHAVE_LOGO, CHAVE_LOGO_ESCURO, imagensDisponiveis } from "@/lib/imagens";
import { exigirAdmin } from "@/lib/sessao";

export const metadata = { title: "Aparência" };

export default async function Aparencia() {
  await exigirAdmin();
  const img = await imagensDisponiveis();
  return (
    <>
      <Titulo voltar={{ href: "/admin", rotulo: "Configurações" }} sub="Imagens que aparecem para todos. O escudo do adversário se envia na edição de cada jogo.">Aparência</Titulo>
      <Cartao className="mb-6">
        <h2 className="mb-1 font-bold">Logo da MRV</h2>
        <p className="mb-4 text-sm text-cinza">Aparece no topo do sistema, no login, na página do convidado e no ícone da aba do navegador. Use o arquivo oficial (PNG transparente ou SVG).</p>
        <div className="grid gap-6 md:grid-cols-[1.4fr_1.4fr_1fr]">
          <div>
            <div className="mb-2 text-sm font-semibold">Para fundo claro <span className="font-normal text-cinza">(principal)</span></div>
            <EnviarImagem chave={CHAVE_LOGO} url={img[CHAVE_LOGO]} rotulo="Logo MRV" formato="logo" dica="Usado no topo e no login" />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">Para fundo escuro <span className="font-normal text-cinza">(opcional)</span></div>
            <EnviarImagem chave={CHAVE_LOGO_ESCURO} url={img[CHAVE_LOGO_ESCURO]} rotulo="Logo MRV (versão clara)" formato="logo" escuro dica="Sem ela, o logo vai num selo branco" />
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold">Ícone da aba <span className="font-normal text-cinza">(opcional)</span></div>
            <EnviarImagem chave={CHAVE_ICONE} url={img[CHAVE_ICONE]} rotulo="Ícone" formato="icone" dica="Quadrado. Sem ele, usa o logo" />
          </div>
        </div>
      </Cartao>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Cartao>
          <h2 className="mb-1 font-bold">Foto da tela de login</h2>
          <p className="mb-4 text-sm text-cinza">Uma foto da Arena MRV, horizontal (1600×1200 ou maior). Ela fica escurecida para o texto aparecer bem.</p>
          <EnviarImagem chave={CHAVE_LOGIN} url={img[CHAVE_LOGIN]} rotulo="Foto da Arena MRV" dica="JPG ou PNG · reduzida automaticamente" escuro />
        </Cartao>
        <Cartao>
          <h2 className="mb-1 font-bold">Escudo do Atlético</h2>
          <p className="mb-4 text-sm text-cinza">Aparece em todos os jogos. Use o arquivo oficial, de preferência PNG com fundo transparente.</p>
          <EnviarImagem chave={CHAVE_ESCUDO_ATLETICO} url={img[CHAVE_ESCUDO_ATLETICO]} rotulo="Escudo do Atlético" formato="escudo" escuro dica="PNG transparente ou SVG" />
        </Cartao>
      </div>
    </>
  );
}
