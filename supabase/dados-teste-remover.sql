-- Remove a CARGA DE TESTE (CARGA_TESTE=remover): jogos marcados como 'DADOS DE TESTE' (e tudo
-- deles), usuários e contatos @teste.invalid e as pessoas fictícias que ficarem sem ingresso.
create or replace function pg_temp.cpf_teste(n int) returns text language plpgsql as $$
declare d int[]; s int; base text := lpad(((n * 104729 + 300000000) % 1000000000)::text, 9, '0');
begin
  d := array(select substr(base, i, 1)::int from generate_series(1, 9) i);
  for k in 9..10 loop
    s := 0;
    for i in 1..k loop s := s + d[i] * (k + 2 - i); end loop;
    d := d || ((s * 10) % 11 % 10);
  end loop;
  return array_to_string(d, '');
end $$;

delete from eventos where observacoes = 'DADOS DE TESTE';
delete from camarote_contatos where email like '%@teste.invalid';
delete from auth.users where email like '%@teste.invalid';
delete from pessoas p
where p.cpf in (select pg_temp.cpf_teste(n) from generate_series(1, 1500) n)
  and not exists (select 1 from ingressos i where i.pessoa_id = p.id);
