-- Adicionar status "reservado" ao enum status_ingresso
-- Este é um novo status que vem ANTES de "solicitado", para Admin reservar ingressos para depois alocar

begin;

-- PostgreSQL não permite adicionar enum values no meio, então recriamos o tipo
alter type status_ingresso rename to _status_ingresso_old;

create type status_ingresso as enum (
  'reservado',                -- novo: apenas Admin pode criar
  'convite_enviado',
  'aguardando_preenchimento',
  'solicitado',
  'validado_area',
  'aprovado',
  'facial_pendente',
  'facial_ok',
  'enviado',
  'confirmado',
  'presente',
  'convite_expirado',
  'lista_espera',
  'recusado',
  'cancelado',
  'no_show'
);

-- Atualizar todas as colunas que usam o tipo
alter table ingressos alter column status type status_ingresso using status::text::status_ingresso;
alter table status_historico alter column de type status_ingresso using de::text::status_ingresso;
alter table status_historico alter column para type status_ingresso using para::text::status_ingresso;
alter table transicoes alter column de type status_ingresso using de::text::status_ingresso;
alter table transicoes alter column para type status_ingresso using para::text::status_ingresso;

-- Remover o tipo antigo
drop type _status_ingresso_old;

-- Atualizar função status_consome para incluir "reservado"
drop function if exists status_consome(status_ingresso);
create or replace function status_consome(s status_ingresso) returns boolean
language sql immutable as $$
  select s not in ('reservado', 'convite_expirado', 'lista_espera', 'recusado', 'cancelado')
$$;

commit;
