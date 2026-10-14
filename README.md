# Ingressos MRV · Arena MRV

Sistema de gestão dos ingressos de patrocínio da MRV na Arena MRV (jogos do Galo e shows). Substitui o processo de e-mail + Microsoft Forms + WhatsApp + planilha: solicitação pelas áreas, validação, aprovação do Marketing, envio, onboarding no Galo ID e exportação.

**Status: Fase 1 (MVP).** Detalhes do que entrou e do que falta no fim deste arquivo.

## Stack

- **Next.js 15** (App Router, Server Actions) + TypeScript + Tailwind 4, interface em pt-BR com as cores do regulamento (`#006B3F` verde, `#FF8B22` laranja)
- **Supabase**: Postgres, Auth por magic link, Row Level Security, Realtime
- **Regras de negócio no banco** (`supabase/migrations/*_funcoes.sql`): cota, CPF duplicado, status, lista de espera e convites são funções `plpgsql` com trava por setor (`SELECT … FOR UPDATE`). A UI, o importador e os jobs passam pelas mesmas funções, e não existe policy de INSERT/UPDATE direto nas tabelas de pedidos e ingressos.
- **exceljs** para importar e exportar XLSX no layout da planilha legada
- **Vitest + PGlite** (Postgres em WebAssembly) para testar as regras do banco sem Docker

## Rodar localmente

Pré-requisitos: Node 20+ e Docker (para o Supabase local).

```bash
npm install
npx supabase start          # sobe Postgres/Auth/Studio e aplica migrations + seed.sql
cp .env.example .env.local  # preencha com as chaves impressas pelo "supabase start"
npm run dev                 # http://localhost:3000
```

O seed cria usuários **fictícios**. Entre com `admin@exemplo.com`, `marketing@exemplo.com` ou `responsavel.dh@exemplo.com` (há um para cada área). O magic link chega no Inbucket local: http://127.0.0.1:54324.

Para recriar o banco do zero: `npx supabase db reset`.

## Testes

```bash
npm test             # unitários + regras do banco (PGlite, não precisa de Docker)
npm run typecheck
npm run lint
```

Os testes cobrem: cota estourando (bloqueio ou lista de espera), cancelamento promovendo a lista de espera, remanejamento, CPF inválido e normalização (`1529297621` → `015.292.976-21`), CPF duplicado entre áreas e entre camarote/arquibancada, convites do Modo B (preenchimento, expiração, lugares não usados voltando ao saldo), pipeline completo até "confirmado", RLS (responsável só vê a própria área; operação não vê dados pessoais), importação e exportação da planilha (ida e volta) e o seed.

Para validar a planilha real **sem colocá-la no repositório**:

```bash
PLANILHA_MRV="/caminho/MRV_TicketManagement_xxx.xlsx" npm test
```

## Publicar (Supabase Cloud + Vercel)

1. **Supabase**: crie o projeto e aplique o schema:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   Não rode o `seed.sql` em produção. Ele só contém dados fictícios.
2. **Auth** (Dashboard → Authentication):
   - *Sign In / Providers → Email*: desligue **Allow new users to sign up** (só o Admin cadastra usuários).
   - *URL Configuration*: Site URL = `https://seu-dominio`; Redirect URLs = `https://seu-dominio/auth/callback`.
   - *Emails → Magic Link*: cole o conteúdo de `supabase/templates/magic_link.html`. Ele usa `token_hash`, então funciona mesmo se o link for aberto em outro aparelho.
   - *SMTP*: configure o remetente (Resend ou o SMTP do domínio MRV). O SMTP padrão do Supabase tem limite baixo de envio.
3. **Vercel**: importe o repositório e configure as variáveis de `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`).
4. **Primeiro Admin**:
   ```bash
   npm run criar-admin -- seu.email@mrv.com.br "Seu Nome"
   ```
   Os demais usuários se cadastram em **Usuários**, dentro do sistema.
5. **Jobs** (`vercel.json`): expirar convites a cada 30 min e fechar prazos de hora em hora. No plano Hobby da Vercel o cron só roda uma vez por dia. Alternativa sem custo: `pg_cron` no próprio Supabase.
   ```sql
   select cron.schedule('expirar-convites', '*/30 * * * *', 'select expirar_convites()');
   select cron.schedule('fechar-prazos', '5 * * * *',
     $$select fechar_prazo(id) from eventos where status = 'aberto' and prazo_solicitacao < now()$$);
   ```

## Importar a planilha legada

Pela tela **Importar** (Admin), com prévia das inconsistências antes de gravar, ou pela linha de comando:

```bash
npm run importar -- "MRV_TicketManagement_GalovsMontevideo 14.10.xlsx" \
  --como admin@mrv.com.br --inicio 2026-10-14T21:30:00-03:00 --dry-run
```

`--dry-run` roda tudo numa transação desfeita no fim: mostra o relatório sem gravar. O importador:

- completa os zeros à esquerda dos CPFs salvos como número, limpa nomes (espaços extras, `nbsp`) e normaliza áreas (`Comercial Corp`, `Comercial BH `…) e status (`Enviado`/`ENVIADO`/`PENDENTE`/vazio + contagem de ENVIADOS)
- importa o convidado da arquibancada (a planilha só tem o CPF) como "Convidado de {titular}"
- trata "sem cadastro" na observação como **facial pendente**
- transforma linhas `RESERVADO` sem dados do camarote em **vagas reservadas** (convites do Modo B), se o evento ainda não aconteceu
- lê a capacidade do camarote da aba Divisão (44 no jogo de 14/10) e registra o ajuste no histórico de cotas
- cruza a aba **Convidados Camarote** com a aba Camarote e lista quem não bate
- barra CPF duplicado no mesmo evento (a regra do banco vale aqui também)

Planilhas reais têm dados pessoais: `*.xlsx` e `*.csv` estão no `.gitignore`.

## Perfis e acesso

| Perfil | O que faz |
|---|---|
| Admin | tudo, mais usuários, importação e auditoria |
| Marketing MRV | eventos, cotas, remanejamento, aprovação, envio, exportação |
| Responsável de área | só as listas das próprias áreas: solicita (Modo A), gera convites (Modo B) e valida a lista. Vê o CPF mascarado. |
| Operação | sem acesso a dados pessoais por enquanto; o check-in entra na fase 2 |
| Torcedor | sem login: página `/i/<token>` com o passo a passo do Galo ID e os botões de status |

Usuário autenticado sem perfil ativo não enxerga nada: as funções e as policies checam `perfis`.

## Fluxo e status

`convite_enviado → aguardando_preenchimento → solicitado → validado_area → aprovado → facial_pendente → facial_ok → enviado → confirmado → presente`, com as laterais `lista_espera`, `convite_expirado`, `recusado`, `cancelado` e `no_show`. A facial vem **antes** do envio, como decidido no planejamento.

As transições permitidas e quem pode fazer cada uma ficam na tabela `transicoes`. Para mudar a ordem, basta editar essa tabela, sem mexer no código. Toda mudança de status vai para `status_historico`, com autor, tipo (usuário/torcedor/sistema) e motivo.

## LGPD

- Aviso de privacidade com aceite obrigatório no formulário do convidado. O texto fica em `config.privacidade`.
- CPF mascarado para responsáveis de área. O CPF completo aparece só para Admin/Marketing e nas telas de envio.
- Auditoria (`auditoria`) de visualização das telas com dados pessoais, cópia de CPFs, exportação, importação e alterações.
- `config.retencao_meses` já existe. O job de anonimização entra na fase 4.

## Estrutura

```
supabase/migrations/   schema · funções de negócio · RLS e dados padrão · leituras agregadas
supabase/seed.sql      dados fictícios para desenvolvimento
src/app/(app)/         telas internas (eventos, painel da área, aprovação, envio, admin)
src/app/i/[token]/     página pública do convite/torcedor
src/app/api/cron/      expiração de convites e fechamento de prazos
src/lib/               CPF, parser de lista colada, mensagens/WhatsApp, importação e exportação XLSX
scripts/               importar-planilha (CLI) · criar-admin
tests/                 unit/ e db/ (PGlite)
```

## Fase 1 — entregue

- Eventos (criar, editar, duplicar cotas de um evento anterior), cotas padrão do regulamento configuráveis, histórico de cotas com motivo
- Painel da área com saldo ao vivo:
  - **Modo A**: o responsável digita os dados ou cola uma lista do WhatsApp/Excel
  - **Modo B**: vagas reservadas com link individual, botões de copiar e `wa.me`, validade, cancelamento e "Aguardando preenchimento"
- Validação da lista pela área (registro de quem e quando); aprovação e recusa em lote; remanejamento; pool ao fechar o prazo; lista de espera automática
- Galo ID mínimo: mensagem `wa.me` pronta, "passo a passo enviado", "Já fiz minha facial" / "Recebi meu ingresso" na página do torcedor
- "A enviar": filtro por setor, área e status; copiar CPFs (só dígitos) e `Nome;CPF`; marcar enviados em lote, com opção de enviar sem facial (registrada)
- Exportação XLSX no layout da planilha (Arquibancada/Pista, Camarote, Convidados Camarote, Divisão)
- Importação da planilha legada (tela e CLI) e das respostas do Microsoft Forms (CSV/XLSX, com mapeamento de colunas)

## Próximas fases

- **Fase 2**: central de pedidos do camarote (fila por prioridade em jogo concorrido, catering e centro de custo, anfitrião obrigatório validado, sugestão de arquibancada), check-in mobile offline, PDF de impressão.
- **Fase 3**: e-mails de convocação por área com template editável, disparo automático do passo a passo, lembretes D-2/D-1 e adapter da API do WhatsApp Business. A interface `CanalMensagem` já existe em `src/lib/mensagens`.
- **Fase 4**: dashboard em tempo real, histórico de uso e no-show por área e por pessoa, relatório pós-evento, job de retenção/anonimização.
