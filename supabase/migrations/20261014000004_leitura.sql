-- Leituras agregadas (sem dados pessoais) para as telas de evento, aprovação e dashboard.

-- Uma linha por (setor, área) do evento. Staff vê todas as áreas; responsável, só as suas.
create or replace function resumo_evento(p_evento uuid)
returns table (
  setor setor, capacidade int, cota_por_area boolean,
  area_id uuid, area_nome text, area_ordem int, cota int, sob_demanda boolean,
  ocupados int, em_espera int, convites_aguardando int, solicitados int, validados int, aprovados int,
  facial_pendente int, facial_ok int, enviados int, confirmados int, presentes int, no_show int,
  ultima_validacao timestamptz
)
language sql stable security definer set search_path = public as $$
  with areas_evento as (
    select es.setor, es.capacidade, es.cota_por_area, a.id as area_id, a.nome, a.ordem, c.quantidade, coalesce(c.sob_demanda, false) as sob_demanda
    from evento_setores es
    join areas a on true
    left join cotas c on c.evento_id = es.evento_id and c.setor = es.setor and c.area_id = a.id
    where es.evento_id = p_evento
      and (c.area_id is not null
           or exists (select 1 from ingressos i where i.evento_id = p_evento and i.setor = es.setor and i.area_id = a.id))
  )
  select ae.setor, ae.capacidade, ae.cota_por_area, ae.area_id, ae.nome, ae.ordem, ae.quantidade, ae.sob_demanda,
         count(*) filter (where status_consome(i.status))::int,
         count(*) filter (where i.status = 'lista_espera')::int,
         count(*) filter (where i.status in ('convite_enviado', 'aguardando_preenchimento'))::int,
         count(*) filter (where i.status = 'solicitado')::int,
         count(*) filter (where i.status = 'validado_area')::int,
         count(*) filter (where i.status = 'aprovado')::int,
         count(*) filter (where i.status = 'facial_pendente')::int,
         count(*) filter (where i.status = 'facial_ok')::int,
         count(*) filter (where i.status = 'enviado')::int,
         count(*) filter (where i.status = 'confirmado')::int,
         count(*) filter (where i.status = 'presente')::int,
         count(*) filter (where i.status = 'no_show')::int,
         (select max(v.em) from validacoes v where v.evento_id = p_evento and v.setor = ae.setor and v.area_id = ae.area_id)
  from areas_evento ae
  left join ingressos i on i.evento_id = p_evento and i.setor = ae.setor and i.area_id = ae.area_id
  where responde_area(ae.area_id)
  group by ae.setor, ae.capacidade, ae.cota_por_area, ae.area_id, ae.nome, ae.ordem, ae.quantidade, ae.sob_demanda
  order by ae.setor, ae.ordem
$$;

-- Totais por setor (capacidade × ocupação), para qualquer perfil ativo
create or replace function resumo_setores(p_evento uuid)
returns table (setor setor, capacidade int, cota_por_area boolean, alocado int, ocupados int, em_espera int)
language sql stable security definer set search_path = public as $$
  select es.setor, es.capacidade, es.cota_por_area,
         coalesce((select sum(c.quantidade)::int from cotas c where c.evento_id = es.evento_id and c.setor = es.setor), 0),
         ocupados(es.evento_id, es.setor),
         (select count(*)::int from ingressos i where i.evento_id = es.evento_id and i.setor = es.setor and i.status = 'lista_espera')
  from evento_setores es
  where es.evento_id = p_evento and meu_papel() is not null
  order by es.setor
$$;

revoke execute on function resumo_evento(uuid), resumo_setores(uuid) from public, anon;
grant execute on function resumo_evento(uuid), resumo_setores(uuid) to authenticated, service_role;

-- Realtime (Supabase): telas de área, aprovação e dashboard escutam mudanças em ingressos
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table ingressos;
  end if;
end $$;
