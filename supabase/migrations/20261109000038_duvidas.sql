-- Dúvidas: conversa entre quem recebe os e-mails (gestor de área ou convidado) e a equipe de
-- ingressos (Admin act.3). Cada conversa já nasce com o contexto: evento, área e/ou ingresso, e quem
-- perguntou — ninguém precisa explicar "de qual jogo é". Só o servidor lê e grava (service role),
-- depois de conferir quem é a pessoa; por isso não há políticas de RLS para os perfis.

create table duvidas (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos (id) on delete cascade,
  area_id uuid references areas (id),
  ingresso_id uuid references ingressos (id) on delete cascade,  -- conversa do convidado
  autor_tipo text not null check (autor_tipo in ('gestor', 'convidado')),
  autor_user uuid,                                                 -- gestor (perfil)
  autor_nome text not null,
  autor_email text,
  status text not null default 'aguardando' check (status in ('aguardando', 'respondida', 'resolvida')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index duvidas_status on duvidas (status, atualizado_em desc);
create index duvidas_evento_area on duvidas (evento_id, area_id);
create unique index duvidas_um_por_ingresso on duvidas (ingresso_id) where ingresso_id is not null;

create table duvida_mensagens (
  id bigint generated always as identity primary key,
  duvida_id uuid not null references duvidas (id) on delete cascade,
  de text not null check (de in ('equipe', 'gestor', 'convidado')),
  autor_user uuid,
  autor_nome text,
  texto text not null check (length(btrim(texto)) between 1 and 4000),
  criado_em timestamptz not null default now()
);
create index duvida_mensagens_conversa on duvida_mensagens (duvida_id, criado_em);

alter table duvidas enable row level security;
alter table duvida_mensagens enable row level security;
revoke all on duvidas, duvida_mensagens from public, anon, authenticated;
grant all on duvidas, duvida_mensagens to service_role;

-- E-mails: dá para responder (a resposta vai para o e-mail operacional) e há o botão "Tenho uma dúvida"
update modelos_email set corpo = replace(corpo,
  'Este é um e-mail automático. Não responda: todo o processo (pedido, validação e envio) é feito pelo sistema de ingressos MRV, pelo link abaixo.',
  'Todo o processo (pedido, validação e envio) é feito pelo sistema de ingressos MRV, pelo link abaixo. Ficou com dúvida? Use o botão “Tenho uma dúvida” no fim deste e-mail.');
update modelos_email set corpo = replace(corpo,
  'Este é um e-mail automático. Não responda: a validação é feita pelo sistema, no botão abaixo.',
  'A validação é feita pelo sistema, no botão abaixo. Ficou com dúvida? Use o botão “Tenho uma dúvida” no fim deste e-mail.');
update modelos_email set corpo = replace(corpo, 'Este é um e-mail automático. Não responda.' || chr(10) || chr(10), '');
update modelos_email set corpo = replace(corpo, 'Este é um e-mail automático. Não responda.', '');
