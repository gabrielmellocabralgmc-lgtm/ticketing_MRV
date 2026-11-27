-- Preencher várias reservas de uma vez (colar a lista do WhatsApp/Excel no Painel).
-- Cada pessoa da lista ocupa uma reserva, na ordem; usa a mesma regra de preencher_reserva
-- (nome + CPF obrigatórios, CPF sem duplicidade no evento). Tudo ou nada: se uma linha falhar,
-- nenhuma reserva é preenchida e o erro diz qual linha.
create or replace function preencher_reservas(p_ingressos uuid[], p_pessoas jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int := coalesce(array_length(p_ingressos, 1), 0);
  v_p jsonb;
  v_msg text;
begin
  perform _exigir(eh_staff(), 'SEM_PERMISSAO: apenas Admin ou Marketing podem preencher reservas');
  perform _exigir(v_n between 1 and 200, 'VALOR_INVALIDO: escolha de 1 a 200 reservas');
  perform _exigir(jsonb_typeof(p_pessoas) = 'array' and jsonb_array_length(p_pessoas) = v_n,
                  'VALOR_INVALIDO: a lista precisa ter uma pessoa para cada reserva');

  for i in 1 .. v_n loop
    v_p := p_pessoas -> (i - 1);
    begin
      perform preencher_reserva(p_ingressos[i], v_p);
    exception when others then
      v_msg := sqlerrm;
      if v_msg ~ '^[A-Z_]{4,}: ' then
        raise exception '%: Linha % (%): %', split_part(v_msg, ':', 1), i,
          coalesce(nullif(btrim(v_p ->> 'nome'), ''), 'sem nome'), substr(v_msg, position(':' in v_msg) + 2);
      end if;
      raise exception 'ERRO: Linha % (%): %', i, coalesce(nullif(btrim(v_p ->> 'nome'), ''), 'sem nome'), v_msg;
    end;
  end loop;
  return v_n;
end $$;
revoke execute on function preencher_reservas(uuid[], jsonb) from public, anon;
grant execute on function preencher_reservas(uuid[], jsonb) to authenticated, service_role;
