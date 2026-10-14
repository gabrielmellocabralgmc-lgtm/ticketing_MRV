-- Configuração de áreas e responsáveis (Admin e Marketing). Uma área pode ter vários
-- responsáveis e uma pessoa pode responder por várias áreas.

create or replace function salvar_area(p_id uuid, p_nome text, p_slug text, p_centro_custo text, p_ativo boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  perform _exigir(eh_staff());
  perform _exigir(limpar_nome(p_nome) is not null, 'VALOR_INVALIDO: informe o nome da área');
  if p_id is null then
    insert into areas (nome, slug, centro_custo, ativo, ordem)
    values (limpar_nome(p_nome), p_slug, nullif(btrim(coalesce(p_centro_custo, '')), ''), coalesce(p_ativo, true),
            coalesce((select max(ordem) from areas), 0) + 10)
    returning id into v_id;
  else
    update areas set nome = limpar_nome(p_nome), centro_custo = nullif(btrim(coalesce(p_centro_custo, '')), ''),
                     ativo = coalesce(p_ativo, ativo)
    where id = p_id returning id into v_id;
    perform _exigir(v_id is not null, 'NAO_ENCONTRADO: área não encontrada');
  end if;
  perform registrar_auditoria('alterar', 'area', v_id::text, jsonb_build_object('nome', p_nome, 'ativo', p_ativo, 'centro_custo', p_centro_custo));
  return v_id;
exception when unique_violation then
  raise exception 'AREA_DUPLICADA: já existe uma área com esse nome';
end $$;

-- p_user já existe em auth.users (criado pelo servidor com service role).
-- Se a pessoa ainda não tem perfil, vira "responsável"; perfis existentes não mudam (só são reativados).
create or replace function adicionar_responsavel(p_area uuid, p_user uuid, p_nome text, p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_staff());
  insert into perfis (user_id, nome, email, papel)
  values (p_user, coalesce(limpar_nome(p_nome), p_email), lower(btrim(p_email)), 'responsavel')
  on conflict (user_id) do update set ativo = true;
  insert into area_responsaveis (area_id, user_id) values (p_area, p_user) on conflict do nothing;
  perform registrar_auditoria('alterar', 'area_responsavel', p_area::text, jsonb_build_object('adicionado', p_email));
end $$;

create or replace function remover_responsavel(p_area uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_staff());
  delete from area_responsaveis where area_id = p_area and user_id = p_user;
  perform registrar_auditoria('alterar', 'area_responsavel', p_area::text, jsonb_build_object('removido', p_user));
end $$;

-- Lista para a tela de configuração (staff vê nomes/e-mails dos responsáveis)
create or replace function responsaveis_por_area()
returns table (area_id uuid, user_id uuid, nome text, email text, ativo boolean)
language sql stable security definer set search_path = public as $$
  select ar.area_id, p.user_id, p.nome, p.email, p.ativo
  from area_responsaveis ar join perfis p on p.user_id = ar.user_id
  where eh_staff()
  order by p.nome
$$;

revoke execute on function salvar_area(uuid, text, text, text, boolean), adicionar_responsavel(uuid, uuid, text, text),
  remover_responsavel(uuid, uuid), responsaveis_por_area() from public, anon;
grant execute on function salvar_area(uuid, text, text, text, boolean), adicionar_responsavel(uuid, uuid, text, text),
  remover_responsavel(uuid, uuid), responsaveis_por_area() to authenticated, service_role;
