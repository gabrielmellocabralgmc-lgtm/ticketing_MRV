# Onde o Ingressos MRV roda (produção)

| Peça | Onde | Observação |
|---|---|---|
| Site | **Vercel**, projeto `ticketing-mrv` → https://ticketing-mrv.vercel.app | Publica sozinho a cada push na `main`. Funções em São Paulo (`gru1`, `vercel.json`), perto do banco |
| Banco | **Neon**, organização *act.3 Brasil*, projeto **Ticketing MRV** (São Paulo), banco `neondb` | Único banco do sistema |
| E-mail | **Resend**, domínio `ingressos.weareact3.com` | Sem `RESEND_API_KEY` nada sai (fica "simulado") |
| Rotinas | **GitHub Actions** (`.github/workflows/rotinas.yml`, a cada 30 min) + cron diário da Vercel (`vercel.json`) | Chamam `/api/cron/*` com o `CRON_SECRET` |

> Histórico: até 25/11/2026 o app também rodou no Railway e o banco ficava dentro do projeto
> *Ingressos adidas* do Neon (banco `Ticketing_MRV`, Ohio). Tudo foi copiado para o projeto
> Ticketing MRV (São Paulo); o Railway foi apagado.

## O que acontece a cada publicação

O build da Vercel roda `npm run vercel-build` = `node scripts/migrar.mjs && next build`:

1. `migrar.mjs` conecta em `DATABASE_URL_DIRETA` (ou `DATABASE_URL`), aplica `supabase/shim.sql`
   e só as migrações novas de `supabase/migrations/` (registro na tabela `_migracoes`), e garante o
   Admin de `ADMIN_EMAIL`. Ele escreve no log o host e o banco usados (sem senha):
   `[migrar] DATABASE_URL: host ep-…-pooler.c-2.sa-east-1.aws.neon.tech, banco neondb`.
2. `next build` monta o site. Se falhar, a Vercel continua mostrando a versão anterior.

Deploys de prévia (Preview) não mexem no banco.

> ⚠️ As **duas** variáveis (`DATABASE_URL` e `DATABASE_URL_DIRETA`) precisam apontar para o
> **mesmo** banco. Se apontarem para bancos diferentes, as migrações vão para um e o site usa outro.

## Variáveis (Vercel → Settings → Environment Variables)

Lista completa e explicada em [`.env.example`](../.env.example). Valores marcados como *Sensitive*
não podem ser vistos de novo na Vercel: para trocar, **⋯ → Edit**, colar o novo valor e **Save**;
depois **Deployments → ⋯ → Redeploy** (a troca só vale depois de publicar de novo).

Onde pegar o endereço do banco: Neon → projeto **Ticketing MRV** → **Connect** → Branch
`production`, Database `neondb` → **Show password** → copiar. Com *Connection pooling* ligado →
`DATABASE_URL`; desligado → `DATABASE_URL_DIRETA`.

## Rotinas automáticas (GitHub Actions)

No GitHub → repositório → **Settings → Secrets and variables → Actions** precisam existir:

- `SITE_URL` = `https://ticketing-mrv.vercel.app` (sem barra no final)
- `CRON_SECRET` = o mesmo valor da Vercel

Teste: aba **Actions** → **Rotinas automáticas** → **Run workflow**. Em ~30 s fica ✓ verde.

## Conferir se está tudo bem

- https://ticketing-mrv.vercel.app/api/saude → `{"ok":true}` (site e banco respondendo)
- Vercel → **Deployments** → último deploy → **Build Logs** → buscar `migrar` (host do banco e
  migrações aplicadas) ou **Logs** (erros do site em funcionamento)

## Primeiro Admin / Admin de emergência

- `ADMIN_EMAIL` (e `ADMIN_NOME`) na Vercel: a cada deploy essa pessoa vira (ou continua) Admin.
- Pela linha de comando (o endereço do banco vai na própria linha, não fica salvo):
  `DATABASE_URL="postgresql://…" npm run criar-admin -- email@mrv.com.br "Nome Sobrenome"`
