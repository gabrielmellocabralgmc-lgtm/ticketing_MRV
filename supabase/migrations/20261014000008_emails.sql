-- E-mails: modelos editáveis e registro de tudo o que foi enviado (caixa de saída).

create table modelos_email (
  chave text primary key,
  nome text not null,
  descricao text not null,
  assunto text not null,
  corpo text not null,           -- texto com {{variaveis}}; vira HTML com a identidade MRV no envio
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

create table envios (
  id bigint generated always as identity primary key,
  tipo text not null,            -- chave do modelo (ou "teste")
  evento_id uuid references eventos (id) on delete cascade,
  area_id uuid references areas (id),
  ingresso_id uuid references ingressos (id) on delete cascade,
  para_nome text,
  para_email text not null,
  assunto text not null,
  corpo text not null,
  status text not null check (status in ('enviado', 'simulado', 'falhou')),
  erro text,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index envios_evento on envios (evento_id, tipo, area_id);
create index envios_ingresso on envios (ingresso_id, tipo);

alter table modelos_email enable row level security;
alter table envios enable row level security;
create policy modelos_ler on modelos_email for select to authenticated using (eh_staff());
create policy modelos_editar on modelos_email for update to authenticated using (eh_staff()) with check (eh_staff());
-- envios são gravados pelo servidor (service role); Admin/Marketing consultam
create policy envios_ler on envios for select to authenticated using (eh_staff());

insert into modelos_email (chave, nome, descricao, assunto, corpo) values
('convocacao_area', 'Convocação da área',
 'Enviado pelo Admin/Marketing a cada responsável de área quando o jogo abre para solicitações.',
 'Ingressos MRV · {{jogo}}: {{cota}} ingressos para {{area}}',
 'Olá, {{responsavel}}!

Os ingressos MRV para {{jogo}} ({{data}}) já estão abertos.

Cota da {{area}}: {{cota}} ingressos na {{setor}}.
Prazo para solicitar: {{prazo}}
Prazo para validar a lista: {{prazo_validacao}}

Como funciona:
- Cada colaborador pode pedir para si + 1 convidado, com nome, CPF e celular.
- Você pode preencher os dados ou gerar um link para o convidado preencher.
- Ao terminar, clique em "Validar lista" para enviar ao Marketing.

Acesse a lista da sua área: {{link}}

Dúvidas: Marketing MRV.'),
('lembrete_area', 'Lembrete para a área',
 'Enviado automaticamente para áreas que ainda não pediram ou não validaram, perto do prazo.',
 'Lembrete: prazo dos ingressos de {{jogo}} termina {{prazo}}',
 'Olá, {{responsavel}}!

A {{area}} ainda tem {{saldo}} de {{cota}} ingressos disponíveis para {{jogo}} e {{pendentes}} pedido(s) aguardando validação.

O prazo termina {{prazo}}. Depois disso, o saldo não usado volta para o Marketing.

Acesse: {{link}}'),
('convite_convidado', 'Convite para o convidado (Modo B)',
 'Enviado quando a área gera um link de convite e informa o e-mail do convidado.',
 'Você foi convidado para {{jogo}} na Arena MRV',
 'Olá, {{nome}}!

A MRV ({{area}}) reservou {{lugares}} para você em {{jogo}} ({{data}}), na {{setor}}.

Para garantir, preencha seus dados (nome, CPF e celular) até {{validade}}:
{{link}}

O pedido ainda passa pela aprovação do Marketing MRV.'),
('galo_id', 'Aprovado: passo a passo do Galo ID',
 'Enviado quando o ingresso é aprovado. A pessoa precisa fazer a facial antes do envio.',
 'Ingresso aprovado: faça seu cadastro no Galo ID',
 'Olá, {{nome}}! Seu ingresso MRV para {{jogo}} ({{data}}) foi aprovado.

Antes de enviarmos o ingresso, faça o cadastro no Galo ID com biometria facial (a entrada na Arena MRV é pela face):

1. Acesse https://galoid.com.br/ e crie sua conta com o seu CPF.
2. Cadastre a biometria facial.
3. Confirme aqui que já fez: {{link}}

Setor: {{setor}}.'),
('ingresso_enviado', 'Ingresso enviado',
 'Enviado quando o ingresso é marcado como enviado no sistema do Atlético.',
 'Seu ingresso para {{jogo}} foi enviado',
 'Olá, {{nome}}! Seu ingresso para {{jogo}} foi enviado pelo sistema do Atlético.

Aceite o ingresso no app/site do Galo e confirme aqui: {{link}}

Portões: {{portoes}}. Setor: {{setor}}. Leve um documento com foto.
Não vai poder ir? Cancele pelo link para o ingresso ir para outra pessoa.'),
('lembrete_facial', 'Lembrete da facial (D-2 / D-1)',
 'Enviado automaticamente a quem foi aprovado e ainda não confirmou a facial no Galo ID.',
 'Falta pouco para {{jogo}}: confirme sua facial no Galo ID',
 'Olá, {{nome}}! {{jogo}} é {{data}} e ainda não recebemos a confirmação da sua facial no Galo ID.

Sem ela, não conseguimos enviar o ingresso.

1. Faça o cadastro e a biometria em https://galoid.com.br/
2. Confirme aqui: {{link}}');

insert into config (chave, valor) values ('lembrete_area_horas', '24'::jsonb) on conflict do nothing;
