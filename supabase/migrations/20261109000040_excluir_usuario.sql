-- Excluir um cadastro de usuário de vez (não só desativar). O histórico dos eventos fica: as
-- referências a quem foi excluído (quem criou, validou, lançou…) passam a ficar vazias.

-- Toda referência a um usuário que hoje impediria a exclusão vira "on delete set null"
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tabela, a.attname as coluna, c.confrelid::regclass as alvo, af.attname as coluna_alvo
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
    where c.contype = 'f' and c.confdeltype = 'a' and array_length(c.conkey, 1) = 1
      and c.confrelid in ('perfis'::regclass, 'auth.users'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
    execute format('alter table %s alter column %I drop not null', r.tabela, r.coluna);
    execute format('alter table %s add constraint %I foreign key (%I) references %s (%I) on delete set null',
                   r.tabela, r.conname, r.coluna, r.alvo, r.coluna_alvo);
  end loop;
end $$;

create or replace function excluir_usuario(p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v perfis;
begin
  perform _exigir(eh_admin(), 'SEM_PERMISSAO: só o Admin exclui cadastros');
  select * into v from perfis where user_id = p_user;
  perform _exigir(found, 'NAO_ENCONTRADO: cadastro não encontrado');
  perform _exigir(p_user <> auth.uid(), 'VALOR_INVALIDO: você não pode excluir o seu próprio cadastro');
  perform _exigir(v.papel <> 'admin' or exists (select 1 from perfis where papel = 'admin' and ativo and user_id <> p_user),
    'VALOR_INVALIDO: este é o único Admin ativo. Cadastre outro Admin antes de excluir.');
  perform registrar_auditoria('excluir', 'perfil', p_user::text, jsonb_build_object('nome', v.nome, 'email', v.email, 'papel', v.papel));
  -- apagar o usuário leva junto o perfil, as áreas, a senha e os links de acesso
  delete from auth.users where id = p_user;
  if not found then delete from perfis where user_id = p_user; end if;
  return v.nome;
end $$;
revoke execute on function excluir_usuario(uuid) from public, anon;
grant execute on function excluir_usuario(uuid) to authenticated, service_role;
