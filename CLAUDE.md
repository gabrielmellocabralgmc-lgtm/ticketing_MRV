# CLAUDE.md — Ingressos MRV · Arena MRV

Guia para o Claude trabalhar neste projeto. Detalhes de negócio e de cada fase estão no [README.md](README.md).

## Quem é o usuário

- Gabriel, **não é programador**. Fale sempre em **português**, de forma simples, sem jargão.
- Toda ação que ele precisar fazer (Vercel, Neon, Resend, GitHub, Terminal) vem com **passo a passo clique a clique**.
- **Nunca peça senhas ou chaves no chat.** Oriente a colar direto no painel (Vercel) ou no arquivo `.env.local`.

## Jeito de trabalhar

- **Fases pequenas**, **um commit por funcionalidade** (mensagens em PT: `Feat: …`, `Fix: …`).
- **Testes para as regras críticas** (cota, CPF, status, convites, RLS) — em `tests/db` (PGlite) ou `tests/unit`.
- **Resumo no fim de cada fase**: o que mudou, como testar, o que falta.
- Antes de dar algo como pronto: `npm test`, `npm run typecheck` e `npm run lint`; se mexer em tela, abrir no modo demo e conferir.
- Commit e push **só quando o usuário pedir**.

## ⚠️ Push na `main` = produção

- A Vercel faz deploy automático de cada push na `main`, e o build (`npm run vercel-build`) roda
  `scripts/migrar.mjs` **no banco real (Neon)** antes do `next build`.
- Por isso: testar tudo localmente antes de subir; nada de "commit para ver se funciona" (o histórico
  já tem várias sequências de `Fix:` em produção por causa disso).
- Deploys de prévia (Preview) **não** mexem no banco.

## Stack (atual)

- **Next.js 15** (App Router, Server Actions) + TypeScript + **Tailwind 4**, interface em pt-BR.
  Cores MRV `#006B3F` (verde) e `#FF8B22` (laranja); telas de jogo/login no estilo Galo ID (preto/branco, fonte Saira).
- **Banco: Postgres no Neon** (não é mais Supabase — a migração `…026_sem_supabase.sql` removeu a dependência).
  `supabase/shim.sql` + `src/lib/db/cliente.ts` imitam a API/RLS do Supabase sobre Postgres puro.
  A pasta continua se chamando `supabase/` por histórico.
- **Login próprio**: link por e-mail (20 min, 1 uso) e senha para Admin; sessão em cookie assinado (`AUTH_SECRET`).
- **E-mail: Resend** (domínio `ingressos.weareact3.com`), adapter em `src/lib/mensagens/email.ts`.
  Sem `RESEND_API_KEY` nada sai de verdade: e-mails ficam como "simulado" na caixa de saída.
- **Hospedagem: Vercel** (`ticketing-mrv.vercel.app`). Railway foi usado antes e desligado (`railway.json` é legado).
- **Rotinas**: GitHub Actions `.github/workflows/rotinas.yml` chama `/api/cron/tudo` a cada 30 min;
  `vercel.json` tem crons diários. Saúde: `/api/saude`.
- **exceljs** (import/export XLSX no layout da planilha legada), **Vitest + PGlite** nos testes.

## Regras de negócio ficam no banco

- Cota, CPF duplicado, status, lista de espera e convites são funções `plpgsql` com trava por setor
  (`SELECT … FOR UPDATE`). UI, importador e rotinas chamam as **mesmas funções**; não há INSERT/UPDATE
  direto nas tabelas de pedidos/ingressos.
- Transições de status permitidas ficam na tabela `transicoes`; toda mudança vai para `status_historico`.
- Perfis: Admin, Marketing, Responsável de área (CPF mascarado), Operação, Operação do camarote; torcedor sem login (`/i/<token>`).

## Migrações

- Ficam em `supabase/migrations/AAAAMMDD0000NN_nome.sql`, numeração sequencial (última: `047_evento_visivel`).
- `scripts/migrar.mjs` aplica **só as novas** (registro na tabela `_migracoes`), cada uma numa transação.
- **Nunca editar uma migração já aplicada** — ela não roda de novo. Sempre criar uma nova, com o próximo número.
- Mudanças em função: `create or replace` (ou `drop function` antes, se mudar parâmetros/retorno).
- Mudança em `enum` (`alter type … add value`) não pode ser usada na mesma transação: separar em migrações.
- Os testes (PGlite) e o modo demo aplicam todas as migrações do zero — rodar `npm test` pega erros de SQL.

## Comandos

```bash
npm install
npm run demo        # roda local em http://localhost:3000 SEM banco real nem .env (PGlite em .demo.nosync/)
npm run demo:zerar  # apaga o banco de demonstração
npm test            # unitários + regras do banco (PGlite)
npm run typecheck
npm run lint
npm run importar -- "<planilha>.xlsx" --como <email> --inicio <data ISO> --dry-run
```

- `.claude/launch.json` tem a configuração `demo` (usar com o navegador do app para conferir telas).
- `npm run dev` precisa de `.env.local` com `DATABASE_URL` etc. — **aponta para o banco real**; prefira o demo.
- A seção "Rodar localmente" do README (`supabase start`) está desatualizada.

## Variáveis de ambiente (ver `.env.example`)

`DATABASE_URL` (Neon com pooler), `DATABASE_URL_DIRETA` (sem pooler, migrações), `AUTH_SECRET`, `SITE_URL`,
`CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_REMETENTE`, `EMAIL_RESPONDER_PARA`, `ADMIN_EMAIL`, `ADMIN_NOME`.
Valores reais ficam só na Vercel (Settings → Environment Variables) e, se preciso, em `.env.local` (fora do git).

## Estrutura

```
supabase/migrations/   schema, funções de negócio, RLS, leituras agregadas (Postgres puro)
supabase/shim.sql      camada auth/papéis que imita o Supabase
supabase/seed.sql      dados fictícios (demo/testes) — nunca em produção
src/app/(app)/         telas internas (eventos, dashboard, admin, operação…)
src/app/i/[token]/     página pública do convidado/torcedor
src/app/api/cron/      rotinas (expirar convites, prazos, lembretes, retenção)
src/lib/               db, auth, CPF, parse de listas, mensagens, xlsx, importação, demo
scripts/               migrar.mjs · importar-planilha.ts · criar-admin.mjs
tests/                 unit/ e db/ (PGlite)
docs/                  DEPLOY-VERCEL.md (atual) · DEPLOY.md (Railway, legado)
```

## LGPD

- Planilhas reais (`*.xlsx`, `*.csv`) nunca entram no git. Não copiar dados pessoais de convidados para o chat.
- CPF completo só para Admin/Marketing e telas de envio; ações com dados pessoais vão para `auditoria`.
