-- Imagens do layout (foto do login, escudo do Atlético, escudo do adversário de cada jogo).
-- Guardadas no próprio banco: funcionam igual no Supabase e no modo demonstração, sem configurar Storage.
-- Não são dados pessoais; são servidas publicamente pela rota /img/<chave>.

create table imagens (
  chave text primary key check (chave ~ '^[a-z0-9-]{1,80}$'),
  mime text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  dados bytea not null check (octet_length(dados) <= 4 * 1024 * 1024),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table imagens enable row level security;
-- leitura só pelas funções abaixo; escrita só por Admin/Marketing

create or replace function salvar_imagem(p_chave text, p_mime text, p_base64 text) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_em timestamptz;
begin
  perform _exigir(eh_staff());
  insert into imagens (chave, mime, dados, atualizado_por)
  values (p_chave, p_mime, decode(p_base64, 'base64'), auth.uid())
  on conflict (chave) do update set mime = excluded.mime, dados = excluded.dados, atualizado_em = now(), atualizado_por = auth.uid()
  returning atualizado_em into v_em;
  perform registrar_auditoria('alterar', 'imagem', p_chave, null);
  return v_em;
end $$;

create or replace function remover_imagem(p_chave text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_staff());
  delete from imagens where chave = p_chave;
end $$;

-- Usada pela rota pública /img/<chave> (service role)
create or replace function ler_imagem(p_chave text)
returns table (mime text, base64 text, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select mime, encode(dados, 'base64'), atualizado_em from imagens where chave = p_chave
$$;

-- Quais imagens existem (para mostrar foto/escudo ou o espaço vazio), sem os bytes
create or replace function imagens_disponiveis()
returns table (chave text, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select chave, atualizado_em from imagens
$$;

revoke execute on function salvar_imagem(text, text, text), remover_imagem(text), ler_imagem(text), imagens_disponiveis() from public, anon;
grant execute on function salvar_imagem(text, text, text), remover_imagem(text), imagens_disponiveis() to authenticated, service_role;
grant execute on function ler_imagem(text) to service_role;
grant execute on function imagens_disponiveis() to service_role;
