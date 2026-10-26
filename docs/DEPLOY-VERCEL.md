# Mudar o Ingressos MRV do Railway para a Vercel

O banco **continua no Neon** (nada muda nele, nenhum dado se perde) e o e-mail continua no Resend.
Só o lugar onde o app roda passa do Railway para a Vercel — como projeto separado, na mesma conta
do adidas_ingressos.

Tempo estimado: 20–30 minutos.

---

## Passo 1 — Copiar as variáveis que já estão no Railway

1. Abra o Railway → serviço **ticketing_MRV** → aba **Variables** → **Raw Editor**.
2. Selecione tudo (**Cmd + A**) e copie (**Cmd + C**).
3. Cole num lugar temporário e seguro (ex.: Notas, sem sincronizar) — você vai precisar no passo 2.
   Não mande por chat/e-mail.

---

## Passo 2 — Criar o projeto na Vercel

1. Entre em **https://vercel.com** com a mesma conta do adidas.
2. Clique em **Add New… → Project**.
3. Em **Import Git Repository**, procure **ticketing_MRV** e clique em **Import**.
   - Se ele não aparecer: clique em **Adjust GitHub App Permissions** (ou *Configure GitHub App*),
     libere o repositório **ticketing_MRV** e volte.
4. Na tela de configuração:
   - **Project Name:** `ticketing-mrv` (vira o endereço `ticketing-mrv.vercel.app`)
   - **Framework Preset:** Next.js (já vem detectado)
   - **Build and Output Settings:** não mexa (o projeto já tem o comando certo, que roda as
     migrações e depois o build)
5. Abra **Environment Variables**:
   - Clique no primeiro campo **Key** e cole (**Cmd + V**) tudo o que você copiou do Railway —
     a Vercel separa sozinha cada linha em nome/valor.
   - Confira/ajuste estas duas linhas:
     - `NEXT_PUBLIC_SITE_URL` — **apague** (na Vercel o endereço é detectado sozinho; se quiser
       fixar, crie `SITE_URL` = `https://ticketing-mrv.vercel.app`)
     - `CARGA_TESTE` — pode apagar (a carga de teste já está no banco e não roda de novo).
6. Clique em **Deploy**. Leva uns 2–3 minutos.

> O endereço dos links (e-mails, convites) é o domínio de produção da Vercel, detectado sozinho.

---

## Passo 3 — Conferir

1. Abra `https://ticketing-mrv.vercel.app/api/saude` → deve aparecer `{"ok":true}`.
2. Abra `https://ticketing-mrv.vercel.app/login` → **Entrar com senha (Admin)** → mesmo e-mail e
   senha de antes. Os jogos e usuários de teste continuam lá (o banco é o mesmo).
3. Se der erro: Vercel → projeto → **Deployments** → clique no deploy → **Build Logs**
   (procure `[migrar]`) ou **Runtime Logs**.

---

## Passo 4 — Rotinas automáticas (GitHub Actions)

No plano gratuito da Vercel o cron roda só uma vez por dia. As rotinas que precisam rodar várias
vezes ao dia (expirar convites, fechar prazos, encerrar jogos, lembretes) são chamadas pelo
**GitHub Actions** a cada 30 minutos — de graça e no próprio repositório.

1. Abra **https://github.com/gabrielmellocabralgmc-lgtm/ticketing_MRV/settings/secrets/actions**
2. Clique em **New repository secret** e crie dois:
   - **Name:** `SITE_URL` · **Secret:** `https://ticketing-mrv.vercel.app` (sem barra no final)
   - **Name:** `CRON_SECRET` · **Secret:** o mesmo valor do `CRON_SECRET` das variáveis
3. Teste agora: aba **Actions** do repositório → **Rotinas automáticas** → **Run workflow** →
   **Run workflow**. Em ~30 s deve ficar com ✓ verde.

Depois disso ele roda sozinho a cada 30 minutos. (Quando a Vercel for para o plano Pro, dá para
trocar pelo cron da própria Vercel.)

---

## Passo 5 — Desligar o Railway

Só depois que o passo 3 funcionar:

1. Railway → projeto **delightful-education** → **Settings** (engrenagem) → **Danger** →
   **Delete project** (ou, no serviço, *Settings → Delete Service*).
2. Isso para o consumo de crédito. O banco não é afetado (ele está no Neon, não no Railway).

---

## Observações

- **Limite de upload na Vercel:** 4,5 MB por envio. As fotos da operação já chegam reduzidas
  (~300 KB); na tela **Aparência**, use imagens menores que 4 MB.
- **Plano Hobby:** é para uso não comercial. Quando o sistema for usado de verdade pela MRV,
  faça o upgrade para o **Pro** (junto com o adidas).
- **Atualizações:** cada envio para a branch `main` do GitHub gera um deploy novo na Vercel, e as
  migrações novas são aplicadas sozinhas no build.
