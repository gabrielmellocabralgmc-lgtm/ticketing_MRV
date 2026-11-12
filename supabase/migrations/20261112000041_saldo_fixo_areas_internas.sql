-- Ao encerrar o prazo, Marketing, Relacionamento Institucional e Presidência ficam com o saldo
-- (não devolvem ao pool). As demais áreas seguem devolvendo o que não usaram.
create or replace function fechar_prazo(p_evento uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_devolvido int := 0;
  v_oc int;
begin
  if auth.uid() is not null then perform _exigir(eh_staff()); end if;
  perform _ctx(case when auth.uid() is null then 'sistema' else 'usuario' end, 'prazo encerrado: saldo devolvido ao pool');
  for c in select ct.* from cotas ct left join areas a on a.id = ct.area_id
           where ct.evento_id = p_evento and not ct.sob_demanda
             and coalesce(a.slug, '') not in ('marketing', 'rel-institucional', 'presidencia')
           order by ct.setor loop
    perform _travar_setor(c.evento_id, c.setor);
    v_oc := ocupados(c.evento_id, c.setor, c.area_id);
    if c.quantidade > v_oc then
      update cotas set quantidade = v_oc where evento_id = c.evento_id and setor = c.setor and area_id = c.area_id;
      v_devolvido := v_devolvido + (c.quantidade - v_oc);
    end if;
  end loop;
  update eventos set status = 'fechado' where id = p_evento and status = 'aberto';
  return v_devolvido;
end $$;
