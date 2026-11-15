-- Atualiza o modelo de e-mail "ingresso_enviado" com instruções de como acessar via Galo ID

update modelos_email set
  corpo = 'Olá, {{nome}}! Seu ingresso para {{jogo}} foi enviado pelo sistema do Atlético.

**Como acessar seu ingresso:**

1. Acesse https://galonaveia.atletico.com.br/ (site de ingressos)
   - Ou use a câmera do celular para ler o QR code que você recebeu
2. Faça login com seu **Galo ID** usando CPF: {{cpf}}
   - Não tem Galo ID? Crie em https://galoid.com.br/ (usando o mesmo CPF)
3. Na plataforma, procure por **"{{jogo}}"** e clique em **"Meus Ingressos"**
4. Localize seu ingresso e clique em **"Aceitar"**
5. Pronto! Seu ingresso fica salvo na sua conta. Seu rosto é seu ingresso na catraca!

**Importante:**
- O cadastro facial é obrigatório para entrar na Arena MRV
- Se não tiver feito a biometria, faça agora em https://galoid.com.br/
- Trazendo alguém? Cada pessoa precisa ter seu próprio ingresso e cadastro facial

**Dia do jogo:**
- Setor: {{setor}}
- Portões abrem às {{portoes}}
- Leve um documento com foto

Não vai poder ir? Cancele o ingresso na sua conta para outra pessoa aproveitar.

Dúvidas: Entre em contato pelo app ou acesse https://galonaveia.atletico.com.br/faq'
where chave = 'ingresso_enviado';

-- Também atualiza o modelo de "ingresso_enviado_show" se existir
update modelos_email set
  corpo = 'Olá, {{nome}}! Seu ingresso para {{jogo}} foi enviado pelo sistema do Atlético.

**Como acessar seu ingresso:**

1. Acesse https://galonaveia.atletico.com.br/ (site de ingressos)
   - Ou use a câmera do celular para ler o QR code que você recebeu
2. Faça login com seu **Galo ID** usando CPF: {{cpf}}
   - Não tem Galo ID? Crie em https://galoid.com.br/ (usando o mesmo CPF)
3. Na plataforma, procure por **"{{jogo}}"** e clique em **"Meus Ingressos"**
4. Localize seu ingresso e clique em **"Aceitar"**
5. Pronto! Seu ingresso fica salvo na sua conta. Seu rosto é seu ingresso na catraca!

**Importante:**
- O cadastro facial é obrigatório para entrar na Arena MRV
- Se não tiver feito a biometria, faça agora em https://galoid.com.br/
- Trazendo alguém? Cada pessoa precisa ter seu próprio ingresso e cadastro facial

**Dia do jogo:**
- Setor: {{setor}}
- Portões abrem às {{portoes}}
- Leve um documento com foto

Não vai poder ir? Cancele o ingresso na sua conta para outra pessoa aproveitar.

Dúvidas: Entre em contato pelo app ou acesse https://galonaveia.atletico.com.br/faq'
where chave = 'ingresso_enviado_show';
