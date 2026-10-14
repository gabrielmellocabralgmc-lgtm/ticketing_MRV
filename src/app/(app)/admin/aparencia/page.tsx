import { EnviarImagem } from "@/components/enviar-imagem";
import { Cartao, Titulo } from "@/components/ui";
import { CHAVE_ESCUDO_ATLETICO, CHAVE_LOGIN, imagensDisponiveis } from "@/lib/imagens";
import { exigirAdmin } from "@/lib/sessao";

export const metadata = { title: "Aparência" };

export default async function Aparencia() {
  await exigirAdmin();
  const img = await imagensDisponiveis();
  return (
    <>
      <Titulo sub="Imagens que aparecem para todos. O escudo do adversário se envia na edição de cada jogo.">Aparência</Titulo>
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
