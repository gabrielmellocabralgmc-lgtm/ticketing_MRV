-- Fase 3: o servidor (service role) marca "passo a passo do Galo ID enviado" após mandar o e-mail.
create or replace function registrar_orientacao(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in select id from ingressos where id = any (p_ids) and status = 'aprovado' loop
    perform _mudar_status(v_id, 'facial_pendente', 'sistema', 'passo a passo do Galo ID enviado por e-mail');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function registrar_orientacao(uuid[]) from public, anon, authenticated;
grant execute on function registrar_orientacao(uuid[]) to service_role;
