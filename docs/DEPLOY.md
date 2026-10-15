# Colocar o Ingressos MRV no ar — Neon + Railway + Resend

Tempo estimado: 20–30 minutos. Você vai precisar de acesso à conta do **Neon** (a mesma do
adidas_ingressos), do **GitHub** (`gabrielmellocabralgmc-lgtm`) e do **Resend**.

> **Senhas e chaves:** cole sempre direto no Railway. Não mande por chat/e-mail e não salve em
> arquivos do projeto.

---

## Parte 1 — Banco de dados no Neon

O sistema fica num **banco separado** dentro do mesmo projeto do adidas: as tabelas não se misturam,
e vocês continuam pagando um plano só.

1. Entre em **https://console.neon.tech** e abra o **projeto do adidas_ingressos**.
2. No menu da esquerda, vá em **Databases** (ou *Branches → main → Databases*).
3. Clique em **New database**:
   - **Name:** `ticketing_mrv`
   - **Owner:** deixe o mesmo usuário do adidas (normalmente `neondb_owner`).
   - Clique em **Create**.
4. Volte para o **Dashboard** do projeto e clique em **Connect** (botão no topo).
5. Na janela que abrir, escolha:
   - **Branch:** `main` · **Database:** `ticketing_mrv` · **Role:** `neondb_owner`
6. Copie **duas** connection strings (guarde num lugar seguro só até colar no Railway):
   - Com **Connection pooling ligado** (o endereço tem `-pooler`) → será a `DATABASE_URL`
   - Com **Connection pooling desligado** (sem `-pooler`) → será a `DATABASE_URL_DIRETA`

   As duas começam com `postgresql://` e terminam com `?sslmode=require`.
7. Anote também a **região** do projeto (aparece no Dashboard, ex.: *AWS US East (N. Virginia)*).
   Vamos usar a região mais próxima no Railway.

Não é preciso criar tabelas: o sistema cria tudo sozinho no primeiro deploy.

---

## Parte 2 — Chave do Resend (e-mails)

1. Entre em **https://resend.com** → **Domains**. Confira se `ingressos.weareact3.com` aparece como
   **Verified**.
   - Se não aparecer: **Add domain** → `ingressos.weareact3.com` → cadastre no DNS do
     weareact3.com os registros que o Resend mostrar e espere ficar *Verified*.
2. Vá em **API Keys** → **Create API key**:
   - **Name:** `ticketing-mrv` · **Permission:** *Sending access* · **Domain:** `ingressos.weareact3.com`
   - Copie a chave (começa com `re_`). Ela só aparece uma vez.

(Uma chave própria para este sistema é melhor do que reaproveitar a do adidas: dá para revogar uma
sem derrubar a outra.)

---

## Parte 3 — Gerar dois segredos

No Terminal do Mac, rode os dois comandos e guarde cada resultado:

```bash
openssl rand -base64 48
```
→ será o `AUTH_SECRET` (assina o login de cada pessoa)

```bash
openssl rand -hex 24
```
→ será o `CRON_SECRET` (protege as rotinas automáticas)

---

## Parte 4 — App no Railway

### 4.1 Criar a conta e o projeto
1. Entre em **https://railway.com** → **Login** → **Continue with GitHub** (conta
   `gabrielmellocabralgmc-lgtm`).
   - A conta nova começa no **Trial**: US$ 5 de crédito por 30 dias, sem cartão.
2. Clique em **New Project** → **Deploy from GitHub repo**.
3. Se pedir, clique em **Configure GitHub App** e libere o acesso ao repositório **ticketing_MRV**.
4. Escolha **ticketing_MRV**. O Railway já começa um primeiro build — **ele vai falhar ou ficar sem
   funcionar até você colocar as variáveis**. Tudo bem.

### 4.2 Região
1. Clique no serviço (o quadrado *ticketing_MRV*) → **Settings** → **Deploy → Regions**.
2. Escolha a região mais perto da região do Neon (Parte 1, passo 7). Ex.: Neon em *US East* →
   Railway em *US East (Virginia)*.

### 4.3 Variáveis
1. No serviço → aba **Variables** → **Raw Editor**.
2. Cole o bloco abaixo, **trocando o que está entre `< >`**:

```
DATABASE_URL=<connection string COM -pooler do Neon>
DATABASE_URL_DIRETA=<connection string SEM pooler do Neon>
AUTH_SECRET=<resultado do openssl rand -base64 48>
CRON_SECRET=<resultado do openssl rand -hex 24>
RESEND_API_KEY=<chave re_... do Resend>
EMAIL_REMETENTE=Ingressos MRV <naoresponda@ingressos.weareact3.com>
ADMIN_EMAIL=<seu e-mail>
ADMIN_NOME=<seu nome>
NEXT_PUBLIC_SITE_URL=https://placeholder.up.railway.app
```

3. Clique em **Update Variables**. (O endereço definitivo entra no passo seguinte.)

### 4.4 Endereço público
1. No serviço → **Settings** → **Networking** → **Generate Domain**.
   - Se perguntar a porta, use a que o Railway sugerir (o app usa a variável `PORT` que ele define).
2. Copie o endereço gerado (ex.: `ticketing-mrv-production.up.railway.app`).
3. Volte em **Variables** e troque `NEXT_PUBLIC_SITE_URL` por `https://<endereço gerado>` (sem barra
   no final).
4. O Railway vai pedir para aplicar as mudanças: clique em **Deploy** (ou *Redeploy*).
   - Isso é necessário porque o endereço entra nos links dos e-mails na hora do build.

### 4.5 Acompanhar o deploy
1. Aba **Deployments** → clique no deploy em andamento → **View logs**.
2. No fim, os logs devem mostrar algo como:
   ```
   [migrar] aplicando 20261014000001_schema.sql
   ...
   [migrar] 26 migração(ões) aplicada(s).
   [migrar] primeiro Admin criado: seu@email
   [agenda] rotinas automáticas ativas
   ✓ Ready
   ```
3. O status fica **Active/Success** quando a verificação de saúde (`/api/saude`) responder.

---

## Parte 5 — Primeiro acesso e conferência

1. Abra `https://<seu endereço>/api/saude` → deve aparecer `{"ok":true}`.
2. Abra `https://<seu endereço>/login`, digite o e-mail do `ADMIN_EMAIL` e clique em
   **Receber link de acesso**.
3. Abra o e-mail **"Seu acesso ao Ingressos MRV"** → **Entrar no sistema** → **Entrar**.
4. Configure o básico (o banco de produção começa **vazio**, sem os dados fictícios da demo):
   - **Configurações › Aparência:** logo da MRV, foto do login, escudo do Atlético.
   - **Configurações › Usuários:** Marketing, operação do camarote.
   - **Configurações › Áreas e responsáveis:** responsáveis de cada área, contatos do camarote
     (VPs, Diretoria, Gestores) e o e-mail/WhatsApp para pedidos do camarote.
   - **Eventos › Novo evento:** o próximo jogo.
5. Faça um teste de ponta a ponta com um e-mail seu: convocação → link para convidado → validação.

---

## Depois do teste (30 dias)

Para continuar no ar, no Railway: **Account → Plans → Hobby** (US$ 5/mês, com US$ 5 de uso
incluídos). Não muda endereço, banco nem nada do que foi configurado.

**Endereço próprio (opcional):** Settings → Networking → **Custom Domain** →
ex. `app.ingressos.weareact3.com` → cadastre no DNS o registro CNAME que o Railway mostrar →
atualize `NEXT_PUBLIC_SITE_URL` → Redeploy.

---

## Se algo der errado

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Log: `DATABASE_URL não configurada` | Variável faltando | Conferir *Variables* e redeploy |
| Log: `[migrar] erro: ... password authentication failed` | Connection string errada | Copiar de novo no Neon (botão Connect) |
| Log: `[migrar] erro: ... permission denied` | Role sem permissão no banco | No Neon, usar o mesmo *Owner* do banco `ticketing_mrv` |
| Deploy fica "unhealthy" | App não conecta ao banco | Ver o erro nos logs; testar `/api/saude` |
| Login diz "Não foi possível enviar o link" | Chave do Resend ou domínio não verificado | Conferir `RESEND_API_KEY` e o domínio no Resend |
| E-mail chega, mas o link abre outro endereço | `NEXT_PUBLIC_SITE_URL` desatualizada | Corrigir e **Redeploy** |
| "O link expirou ou já foi usado" | Link com mais de 20 min ou já usado | Pedir um novo link |

Atualizações futuras: cada `git push` na branch `main` gera um deploy novo automaticamente, e as
migrações novas são aplicadas sozinhas.
