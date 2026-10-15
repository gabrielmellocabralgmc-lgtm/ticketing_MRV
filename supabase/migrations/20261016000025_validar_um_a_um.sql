-- Validação nome a nome: o gestor da área valida só os convidados que escolher
-- (mesmas regras da lista inteira: só da área dele, só "Preenchido", dentro do prazo).
create or replace function validar_ingressos(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v record;
  v_n int := 0;
begin
  for v in select id, evento_id, setor, area_id, status from ingressos where id = any (p_ids) order by criado_em loop
    perform _exigir(responde_area(v.area_id));
    perform _exigir(eh_staff() or _dentro_do_prazo(v.evento_id), 'PRAZO_ENCERRADO: o prazo para validar a lista terminou. Fale com o Marketing MRV.');
    perform _exigir(v.status = 'solicitado', 'TRANSICAO_INVALIDA: só dá para validar quem está como "Preenchido"');
    perform _mudar_status(v.id, 'validado_area', 'usuario', 'validado pelo gestor (individual)');
    perform _mudar_status(v.id, 'aprovado', 'sistema', 'validado pelo gestor (individual)');
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then
    insert into validacoes (evento_id, setor, area_id, validado_por, qtd)
    select evento_id, setor, area_id, auth.uid(), count(*)::int from ingressos where id = any (p_ids) group by 1, 2, 3;
  end if;
  return v_n;
end $$;
revoke execute on function validar_ingressos(uuid[]) from public, anon;
grant execute on function validar_ingressos(uuid[]) to authenticated, service_role;
