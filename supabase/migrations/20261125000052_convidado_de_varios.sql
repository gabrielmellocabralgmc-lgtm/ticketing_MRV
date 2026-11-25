-- "Convidado de" para várias pessoas de uma vez (mesmo anfitrião), tudo ou nada:
-- se uma falhar (ex.: o anfitrião está entre os selecionados), nenhuma é alterada.
create or replace function definir_convidado_de_varios(p_ingressos uuid[], p_anfitriao uuid default null, p_externo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  perform _exigir(eh_staff(), 'SEM_PERMISSAO: apenas Admin ou Marketing podem alterar o anfitrião');
  perform _exigir(coalesce(array_length(p_ingressos, 1), 0) between 1 and 200, 'VALOR_INVALIDO: selecione de 1 a 200 pessoas');
  foreach v_id in array p_ingressos loop
    perform definir_convidado_de(v_id, p_anfitriao, p_externo);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function definir_convidado_de_varios(uuid[], uuid, text) from public, anon;
grant execute on function definir_convidado_de_varios(uuid[], uuid, text) to authenticated, service_role;
