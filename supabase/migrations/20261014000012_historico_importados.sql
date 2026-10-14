-- Histórico: registros importados da planilha antiga não entram em "última hora" nem em
-- "não aceitos" (a planilha não registrava quando o pedido foi feito nem o aceite do ingresso).

create or replace function historico_areas(p_desde timestamptz)
returns table (area_id uuid, area text, eventos int, cota int, usados int, cancelados int, recusados int,
               presentes int, no_show int, nao_aceitos int, ultima_hora int)
language sql stable security definer set search_path = public as $$
  with ev as (select id, inicio, prazo_solicitacao from eventos where inicio >= p_desde and inicio < now() and status <> 'rascunho'),
  cota as (
    select c.area_id, count(distinct c.evento_id)::int as eventos, sum(c.quantidade)::int as cota
    from cotas c join ev on ev.id = c.evento_id group by c.area_id
  ),
  uso as (
    select i.area_id,
      count(*) filter (where status_consome(i.status) and i.pessoa_id is not null)::int as usados,
      count(*) filter (where i.status = 'cancelado')::int as cancelados,
      count(*) filter (where i.status = 'recusado')::int as recusados,
      count(*) filter (where i.status = 'presente')::int as presentes,
      count(*) filter (where i.status = 'no_show')::int as no_show,
      count(*) filter (where i.status = 'enviado' and i.setor <> 'camarote' and pe.origem <> 'importacao')::int as nao_aceitos,
      count(*) filter (where i.pessoa_id is not null and pe.origem <> 'importacao' and (
        (ev.prazo_solicitacao is not null and i.criado_em > ev.prazo_solicitacao) or i.criado_em > ev.inicio - interval '24 hours'))::int as ultima_hora
    from ingressos i join ev on ev.id = i.evento_id join pedidos pe on pe.id = i.pedido_id group by i.area_id
  )
  select a.id, a.nome, coalesce(cota.eventos, 0), coalesce(cota.cota, 0), coalesce(uso.usados, 0), coalesce(uso.cancelados, 0),
         coalesce(uso.recusados, 0), coalesce(uso.presentes, 0), coalesce(uso.no_show, 0), coalesce(uso.nao_aceitos, 0), coalesce(uso.ultima_hora, 0)
  from areas a left join cota on cota.area_id = a.id left join uso on uso.area_id = a.id
  where eh_staff() and (cota.area_id is not null or uso.area_id is not null)
  order by a.ordem
$$;

create or replace function historico_pessoas(p_desde timestamptz, p_limite int default 30)
returns table (pessoa_id uuid, nome text, cpf text, areas text, eventos int, presentes int, no_show int, cancelados int, nao_aceitos int)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, mascarar_cpf(p.cpf), string_agg(distinct a.nome, ', '),
         count(distinct i.evento_id)::int,
         count(*) filter (where i.status = 'presente')::int,
         count(*) filter (where i.status = 'no_show')::int,
         count(*) filter (where i.status = 'cancelado')::int,
         count(*) filter (where i.status = 'enviado' and i.setor <> 'camarote' and pe.origem <> 'importacao')::int
  from ingressos i
  join pedidos pe on pe.id = i.pedido_id
  join pessoas p on p.id = i.pessoa_id
  join areas a on a.id = i.area_id
  join eventos e on e.id = i.evento_id
  where eh_staff() and e.inicio >= p_desde and e.inicio < now() and p.anonimizada_em is null
  group by p.id
  having count(*) filter (where i.status in ('no_show', 'cancelado')) > 0
      or count(*) filter (where i.status = 'enviado' and i.setor <> 'camarote' and pe.origem <> 'importacao') > 0
  order by count(*) filter (where i.status = 'no_show') desc,
           count(*) filter (where i.status = 'enviado' and i.setor <> 'camarote' and pe.origem <> 'importacao') desc,
           count(*) filter (where i.status = 'cancelado') desc
  limit p_limite
$$;

create or replace function historico_eventos(p_desde timestamptz)
returns table (evento_id uuid, titulo text, inicio timestamptz, concorrido boolean, capacidade int, usados int,
               espera_nao_atendida int, ultima_hora int, presentes int, no_show int)
language sql stable security definer set search_path = public as $$
  select e.id, e.titulo, e.inicio, e.concorrido,
         (select coalesce(sum(capacidade), 0)::int from evento_setores es where es.evento_id = e.id),
         count(*) filter (where status_consome(i.status) and i.pessoa_id is not null)::int,
         count(*) filter (where i.status = 'lista_espera')::int,
         count(*) filter (where i.pessoa_id is not null and pe.origem <> 'importacao' and ((e.prazo_solicitacao is not null and i.criado_em > e.prazo_solicitacao) or i.criado_em > e.inicio - interval '24 hours'))::int,
         count(*) filter (where i.status = 'presente')::int,
         count(*) filter (where i.status = 'no_show')::int
  from eventos e left join ingressos i on i.evento_id = e.id left join pedidos pe on pe.id = i.pedido_id
  where eh_staff() and e.inicio >= p_desde and e.inicio < now() and e.status <> 'rascunho'
  group by e.id
  order by e.inicio desc
$$;
