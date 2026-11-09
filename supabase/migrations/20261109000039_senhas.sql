-- Login com senha para gestores, Marketing e Admin (o convidado continua só com o link pessoal).
-- A senha é criada no primeiro acesso (que entra pelo link do e-mail) e trocada pelo "Esqueci a senha".
-- Guardamos só o hash (scrypt, com sal). Só o servidor lê estas tabelas.

create table credenciais (
  user_id uuid primary key references perfis (user_id) on delete cascade,
  senha_hash text not null,
  atualizado_em timestamptz not null default now()
);

-- tentativas de login por senha (limite contra quem tenta adivinhar)
create table login_tentativas (
  id bigint generated always as identity primary key,
  email text not null,
  ok boolean not null,
  em timestamptz not null default now()
);
create index login_tentativas_email on login_tentativas (lower(email), em desc);

alter table credenciais enable row level security;
alter table login_tentativas enable row level security;
revoke all on credenciais, login_tentativas from public, anon, authenticated;
