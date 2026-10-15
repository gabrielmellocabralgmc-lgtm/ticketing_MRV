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
   - *SMTP* (o padrão do Supabase tem limite baixo de envio): use o Resend, ver **E-mail** abaixo.
3. **Vercel**: importe o repositório e configure as variáveis de `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_REMETENTE`).
4. **Primeiro Admin**:
   ```bash
   npm run criar-admin -- seu.email@mrv.com.br "Seu Nome"
   ```
   Os responsáveis de cada área são cadastrados em **Áreas e responsáveis** (Admin ou Marketing); os demais perfis, em **Usuários**.
5. **Jobs** (`vercel.json`): expirar convites a cada 30 min e fechar prazos de hora em hora. No plano Hobby da Vercel o cron só roda uma vez por dia. Alternativa sem custo: `pg_cron` no próprio Supabase.
   ```sql
   select cron.schedule('expirar-convites', '*/30 * * * *', 'select expirar_convites()');
   select cron.schedule('fechar-prazos', '5 * * * *',
     $$select fechar_prazo(id) from eventos where status = 'aberto' and prazo_solicitacao < now()$$);
   ```

## E-mail (Resend, domínio `ingressos.weareact3.com`)

1. No Resend: *Domains → Add domain* → `ingressos.weareact3.com` e crie no DNS do `weareact3.com` exatamente os registros (SPF, DKIM, MX) que o Resend mostrar. Espere ficar **Verified**.
2. Crie uma API key (*API Keys → Create*, permissão *Sending access*, restrita ao domínio).
3. **Login (magic link)** sai pelo Supabase Auth usando o SMTP do Resend. Em *Authentication → Emails → SMTP Settings*:
   - Host `smtp.resend.com`, porta `465`, usuário `resend`, senha = a API key
   - Sender email `naoresponda@ingressos.weareact3.com`, sender name `Ingressos MRV`
4. **Mensagens do sistema** (convites, passo a passo do Galo ID, lembretes — fase 3) usam a API do Resend pelo adapter `src/lib/mensagens/email.ts`, com `RESEND_API_KEY` e `EMAIL_REMETENTE` (padrão `Ingressos MRV <naoresponda@ingressos.weareact3.com>`). `EMAIL_RESPONDER_PARA` opcional faz as respostas irem para o Marketing.

## Áreas e responsáveis

Em **Áreas e responsáveis** (Admin e Marketing): criar/renomear/desativar áreas, centro de custo, e adicionar ou remover responsáveis por nome e e-mail — **mais de um por área**, e uma pessoa pode responder por várias. Quem é adicionado recebe acesso por magic link (a conta é criada na hora) e passa a ver só as listas dessas áreas. Área nova não tem cota nos eventos já criados: defina em *Ajustar cota* na página do evento.

## Aparência

Visual baseado no site da MRV (fundo branco, verde, cantos de 8 px) com o do Galo ID (preto e branco, fonte Saira) nas telas de jogo e no login. Em **Aparência** (Admin) envia-se o logo da MRV (fundo claro, fundo escuro e ícone da aba), a foto da tela de login e o escudo do Atlético; o escudo do adversário fica na edição de cada jogo. As imagens ficam no próprio banco (tabela `imagens`, até 4 MB, reduzidas no navegador) e são servidas em `/img/<chave>`. Sem imagem, aparece o espaço vazio no formato de escudo.

## Envio dos ingressos (sistema do Atlético)

O sistema do Atlético não aceita envio em lote, então a tela **A enviar** é uma fila para o envio manual, um por um: em cada linha, *Copiar CPF* → enviar no sistema do Atlético → *Enviado ✓*. A linha sai da fila e o status fica registrado com data/hora. Por padrão a fila mostra só quem já confirmou a facial no Galo ID; quem ainda não confirmou fica na aba *Aprovados sem facial* (envio possível, com confirmação, e registrado). Cada cópia de CPF entra na auditoria.

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
- lê a capacidade do camarote da aba Divisão (o padrão é 44) e registra o ajuste no histórico se for diferente
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
- "A enviar": fila para envio manual um a um (copiar CPF da linha → *Enviado ✓*), filtros por setor/área, opção de enviar sem facial (registrada)
- Áreas e responsáveis configuráveis (vários por área)
- Exportação XLSX no layout da planilha (Arquibancada/Pista, Camarote, Convidados Camarote, Divisão)
- Importação da planilha legada (tela e CLI) e das respostas do Microsoft Forms (CSV/XLSX, com mapeamento de colunas)

## Fase 2 — entregue

- **Central de pedidos do camarote** (aba Camarote do Painel do jogo): anfitrião, área, prioridade, convidados colados do WhatsApp, catering corporativo (centro de custo obrigatório) ou pessoal, indicação e observações. Se o anfitrião não estiver presente, o sistema orienta a usar a arquibancada.
- **Jogo concorrido**: pedidos do camarote entram numa fila e o botão *Distribuir vagas pela prioridade* preenche as vagas na ordem Dir. Executiva/Presidência → Diretores → Gestores (e, entre iguais, quem pediu antes); pedido que não cabe inteiro é pulado. Em jogo tranquilo o pedido do Marketing já entra aprovado.
- **Link para os convidados do anfitrião**: depois de aprovado, gera-se um link que o anfitrião manda aos convidados; quem preenche entra aprovado e vinculado a ele.
- **Histórico de cada pedido** (quem lançou, aprovou, alterou e cada mudança de status) e edição de prioridade/catering com registro.
- **Check-in**: pessoa fora da lista (a operação registra e o Marketing libera no painel; liberada, já entra como “chegou”), confirmações guardadas no celular quando a internet cai (enviadas depois com o horário real) e lista para imprimir/salvar em PDF.
- **Encerrar evento** (botão no Admin e automático 6 h após o início): no camarote, quem teve a chegada confirmada vira *presente* e quem não teve vira *no-show*.

## Fase 3 — entregue

- **Convocação das áreas** (página do evento, Admin): e-mail para cada responsável com a cota, os prazos e o link da lista da área; prévia, “enviar teste para mim” e registro de quando cada área foi avisada.
- **Lembretes automáticos** (cron de hora em hora, ou “Rodar lembretes agora”): às áreas com saldo ou pedidos sem validar nas últimas 24 h antes do prazo (uma vez) e aos convidados com a facial pendente no D-2 e D-1.
- **E-mails aos convidados** (só para quem tem e-mail cadastrado; os demais seguem pelo WhatsApp): convite do Modo B (campo de e-mail opcional ao gerar o link), passo a passo do Galo ID ao ser aprovado (o status passa para “facial pendente”) e aviso de ingresso enviado.
- **E-mails › Modelos**: textos editáveis com variáveis `{{...}}`, prévia ao vivo com a identidade MRV e envio de teste. **Caixa de saída**: tudo o que foi enviado, com status.
- Sem `RESEND_API_KEY` (modo demo/local) nada sai de verdade: os e-mails ficam na caixa de saída como “simulado”.
- WhatsApp continua por *click-to-chat*; a interface `CanalMensagem` está pronta para a API oficial do WhatsApp Business.

## Fase 4 — entregue

- **Dashboard** (Admin, atualiza sozinho): cada próximo jogo com o funil por setor (solicitados → aprovados → enviados → confirmados → presentes) e as **pendências com atalho** (áreas sem pedido, listas sem validar, convites aguardando/expirando, a aprovar, facial pendente, a enviar, fila do camarote, gente na porta).
- **Histórico** (3, 6 ou 12 meses): por área (uso da cota, no-show, ingressos não aceitos, cancelamentos, pedidos de última hora), pessoas com mais faltas e jogos do período (ocupação, quem ficou na espera, última hora). Dados importados da planilha não entram em “última hora” nem “não aceitos”.
- **Relatório pós-evento por área** (botão *Relatório* no jogo): imprimir ou salvar em PDF, sem dados pessoais.
- **Privacidade (LGPD)**: prazo de retenção (padrão 12 meses após o último jogo da pessoa), anonimização automática diária e manual, e pedido do titular por CPF (bloqueado se houver ingresso para jogo futuro). Nome, CPF, celular e e-mail são apagados; ingressos e métricas ficam.
- Menu do Admin agrupado em **Configurações**.

## Operação do camarote

Aba **Operação camarote** (perfis Operação do camarote e Admin): check-list antes e depois do jogo,
controle de bebidas (a sobra vem da contagem final do jogo anterior), relatório geral e fotos de comprovação.

- Itens dos check-lists e bebidas: **Configurações › Operação do camarote** (Admin).
- Fotos: reduzidas no celular (~1600 px, JPEG ≈ 200–400 KB) e guardadas **fora do banco**, no Supabase Storage
  (bucket privado `operacao`, criado pela migração). O banco guarda só o registro, com o horário de envio.
  No modo demo ficam em `.demo.nosync/fotos/`.
- Relatório completo para imprimir/PDF: `/operacao-camarote/<evento>/imprimir`.
