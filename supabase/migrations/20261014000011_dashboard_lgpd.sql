-- Fase 4: dashboard, histórico (uso e no-show por área e por pessoa), relatório pós-evento
-- e LGPD (retenção com anonimização e exclusão a pedido do titular).

-- ---------------------------------------------------------------- dashboard dos próximos jogos
-- Um JSON por evento: funil por setor e pendências acionáveis.
create or replace function dashboard_eventos()
returns table (evento jsonb)
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id, 'titulo', e.titulo, 'inicio', e.inicio, 'status', e.status, 'concorrido', e.concorrido,
    'prazo_solicitacao', e.prazo_solicitacao, 'adversario', e.adversario,
    'setores', (
      select coalesce(jsonb_agg(s.x order by s.ordem), '[]'::jsonb) from (
        select es.setor::text as ordem, jsonb_build_object(
          'setor', es.setor, 'capacidade', es.capacidade,
          'solicitados', count(i.id) filter (where status_consome(i.status) and i.status not in ('convite_enviado', 'aguardando_preenchimento')),
          'aprovados', count(i.id) filter (where i.status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente', 'no_show')),
          'enviados', count(i.id) filter (where i.status in ('enviado', 'confirmado', 'presente', 'no_show')),
          'confirmados', count(i.id) filter (where i.status in ('confirmado', 'presente')),
          'presentes', count(i.id) filter (where i.status = 'presente' or (i.setor = 'camarote' and i.chegada_em is not null)),
          'espera', count(i.id) filter (where i.status = 'lista_espera')
        ) as x
        from evento_setores es left join ingressos i on i.evento_id = es.evento_id and i.setor = es.setor
        where es.evento_id = e.id
        group by es.setor, es.capacidade
      ) s
    ),
    'pendencias', jsonb_build_object(
      'areas_sem_pedido', (
        select coalesce(jsonb_agg(a.nome order by a.ordem), '[]'::jsonb) from cotas c join areas a on a.id = c.area_id
        where c.evento_id = e.id and c.setor <> 'camarote' and c.quantidade > 0 and not c.sob_demanda
          and not exists (select 1 from ingressos i where i.evento_id = e.id and i.area_id = c.area_id and i.setor = c.setor)),
      'listas_sem_validar', (
        select coalesce(jsonb_agg(distinct a.nome), '[]'::jsonb) from ingressos i join areas a on a.id = i.area_id
        where i.evento_id = e.id and i.status = 'solicitado' and i.setor <> 'camarote'),
      'convites_aguardando', (select count(*) from convites c where c.evento_id = e.id and c.status = 'aguardando' and c.expira_em > now()),
      'convites_expiram_24h', (select count(*) from convites c where c.evento_id = e.id and c.status = 'aguardando' and c.expira_em between now() and now() + interval '24 hours'),
      'a_aprovar', (select count(*) from ingressos i where i.evento_id = e.id and i.status = 'validado_area'),
      'facial_pendente', (select count(*) from ingressos i where i.evento_id = e.id and i.status in ('aprovado', 'facial_pendente')),
      'a_enviar', (select count(*) from ingressos i where i.evento_id = e.id and i.status = 'facial_ok'),
      'fila_camarote', (select count(*) from ingressos i where i.evento_id = e.id and i.setor = 'camarote' and i.status = 'lista_espera'),
      'na_porta', (select count(*) from walkins w where w.evento_id = e.id and w.status = 'pendente')
    )
  )
  from eventos e
  where eh_staff() and e.status in ('rascunho', 'aberto', 'fechado') and e.inicio > now() - interval '12 hours'
  order by e.inicio
$$;

-- ---------------------------------------------------------------- histórico
-- No-show só é medido onde há check-in (camarote). Na arquibancada/pista o indicador é
-- "não aceitou o ingresso" (enviado e nunca confirmado pelo link).
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
      count(*) filter (where i.status = 'enviado' and i.setor <> 'camarote')::int as nao_aceitos,
      count(*) filter (where i.pessoa_id is not null and (
        (ev.prazo_solicitacao is not null and i.criado_em > ev.prazo_solicitacao) or i.criado_em > ev.inicio - interval '24 hours'))::int as ultima_hora
    from ingressos i join ev on ev.id = i.evento_id group by i.area_id
  )
  select a.id, a.nome, coalesce(cota.eventos, 0), coalesce(cota.cota, 0), coalesce(uso.usados, 0), coalesce(uso.cancelados, 0),
         coalesce(uso.recusados, 0), coalesce(uso.presentes, 0), coalesce(uso.no_show, 0), coalesce(uso.nao_aceitos, 0), coalesce(uso.ultima_hora, 0)
  from areas a left join cota on cota.area_id = a.id left join uso on uso.area_id = a.id
  where eh_staff() and (cota.area_id is not null or uso.area_id is not null)
  order by a.ordem
$$;

-- Pessoas com mais faltas (CPF mascarado; anonimizadas ficam de fora)
create or replace function historico_pessoas(p_desde timestamptz, p_limite int default 30)
returns table (pessoa_id uuid, nome text, cpf text, areas text, eventos int, presentes int, no_show int, cancelados int, nao_aceitos int)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, mascarar_cpf(p.cpf), string_agg(distinct a.nome, ', '),
         count(distinct i.evento_id)::int,
         count(*) filter (where i.status = 'presente')::int,
         count(*) filter (where i.status = 'no_show')::int,
         count(*) filter (where i.status = 'cancelado')::int,
         count(*) filter (where i.status = 'enviado' and i.setor <> 'camarote')::int
  from ingressos i
  join pessoas p on p.id = i.pessoa_id
  join areas a on a.id = i.area_id
  join eventos e on e.id = i.evento_id
  where eh_staff() and e.inicio >= p_desde and e.inicio < now() and p.anonimizada_em is null
  group by p.id
  having count(*) filter (where i.status in ('no_show', 'cancelado')) > 0
      or count(*) filter (where i.status = 'enviado' and i.setor <> 'camarote') > 0
  order by count(*) filter (where i.status = 'no_show') desc,
           count(*) filter (where i.status = 'enviado' and i.setor <> 'camarote') desc,
           count(*) filter (where i.status = 'cancelado') desc
  limit p_limite
$$;

-- Jogos do período: ocupação, demanda reprimida (espera/fila) e última hora
create or replace function historico_eventos(p_desde timestamptz)
returns table (evento_id uuid, titulo text, inicio timestamptz, concorrido boolean, capacidade int, usados int,
               espera_nao_atendida int, ultima_hora int, presentes int, no_show int)
language sql stable security definer set search_path = public as $$
  select e.id, e.titulo, e.inicio, e.concorrido,
         (select coalesce(sum(capacidade), 0)::int from evento_setores es where es.evento_id = e.id),
         count(*) filter (where status_consome(i.status) and i.pessoa_id is not null)::int,
         count(*) filter (where i.status = 'lista_espera')::int,
         count(*) filter (where i.pessoa_id is not null and ((e.prazo_solicitacao is not null and i.criado_em > e.prazo_solicitacao) or i.criado_em > e.inicio - interval '24 hours'))::int,
         count(*) filter (where i.status = 'presente')::int,
         count(*) filter (where i.status = 'no_show')::int
  from eventos e left join ingressos i on i.evento_id = e.id
  where eh_staff() and e.inicio >= p_desde and e.inicio < now() and e.status <> 'rascunho'
  group by e.id
  order by e.inicio desc
$$;

-- ---------------------------------------------------------------- relatório pós-evento por área
create or replace function relatorio_evento(p_evento uuid)
returns table (setor setor, area text, cota int, pedidos int, aprovados int, enviados int, confirmados int,
               presentes int, no_show int, cancelados int, recusados int, espera_nao_atendida int, convites_expirados int)
language sql stable security definer set search_path = public as $$
  select x.setor, a.nome, c.quantidade,
         count(i.id) filter (where i.pessoa_id is not null)::int,
         count(i.id) filter (where i.status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente', 'no_show'))::int,
         count(i.id) filter (where i.status in ('enviado', 'confirmado', 'presente', 'no_show'))::int,
         count(i.id) filter (where i.status in ('confirmado', 'presente'))::int,
         count(i.id) filter (where i.status = 'presente')::int,
         count(i.id) filter (where i.status = 'no_show')::int,
         count(i.id) filter (where i.status = 'cancelado')::int,
         count(i.id) filter (where i.status = 'recusado')::int,
         count(i.id) filter (where i.status = 'lista_espera')::int,
         count(i.id) filter (where i.status = 'convite_expirado')::int
  from (select distinct setor, area_id from ingressos where evento_id = p_evento
        union select setor, area_id from cotas where evento_id = p_evento) x
  join areas a on a.id = x.area_id
  left join cotas c on c.evento_id = p_evento and c.setor = x.setor and c.area_id = x.area_id
  left join ingressos i on i.evento_id = p_evento and i.setor = x.setor and i.area_id = x.area_id
  where eh_staff()
  group by x.setor, a.nome, a.ordem, c.quantidade
  order by x.setor, a.ordem
$$;

-- ---------------------------------------------------------------- LGPD: retenção e anonimização
-- Remove dados pessoais de quem só tem ingressos em eventos anteriores ao corte.
-- Os ingressos e status ficam (métricas agregadas continuam), sem nome, CPF, celular ou e-mail.
create or replace function _anonimizar_pessoas(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  update pessoas set nome = 'Anonimizado', cpf = null, email = null, celular = null, anonimizada_em = now()
  where id = any (p_ids) and anonimizada_em is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function pessoas_para_anonimizar(p_meses int)
returns table (pessoa_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id from pessoas p
  where p.anonimizada_em is null
    and exists (select 1 from ingressos i where i.pessoa_id = p.id)
    and not exists (
      select 1 from ingressos i join eventos e on e.id = i.evento_id
      where i.pessoa_id = p.id and e.inicio >= now() - make_interval(months => p_meses))
$$;

create or replace function anonimizar_por_retencao(p_meses int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_meses int := coalesce(p_meses, (select (valor #>> '{}')::int from config where chave = 'retencao_meses'), 12);
  v_corte timestamptz := now() - make_interval(months => v_meses);
  v_pessoas int;
  v_envios int;
  v_walkins int;
begin
  if auth.uid() is not null then perform _exigir(eh_admin()); end if;
  perform _exigir(v_meses >= 1, 'VALOR_INVALIDO: a retenção mínima é 1 mês');
  v_pessoas := _anonimizar_pessoas(array(select pessoa_id from pessoas_para_anonimizar(v_meses)));
  update envios set para_email = 'anonimizado', para_nome = null, corpo = '[conteúdo removido pela política de retenção]'
  where criado_em < v_corte and para_email <> 'anonimizado';
  get diagnostics v_envios = row_count;
  update walkins w set nome = 'Anonimizado', cpf = null, observacao = null
  from eventos e where e.id = w.evento_id and e.inicio < v_corte and w.nome <> 'Anonimizado';
  get diagnostics v_walkins = row_count;
  update convites c set contato = null, nome_previsto = null from eventos e where e.id = c.evento_id and e.inicio < v_corte and c.contato is not null;
  perform registrar_auditoria('anonimizar', 'lgpd', null, jsonb_build_object('meses', v_meses, 'pessoas', v_pessoas, 'envios', v_envios, 'walkins', v_walkins));
  return jsonb_build_object('meses', v_meses, 'pessoas', v_pessoas, 'envios', v_envios, 'walkins', v_walkins);
end $$;

-- Pedido do titular (LGPD art. 18): anonimiza uma pessoa já, pelo CPF
create or replace function anonimizar_titular(p_cpf text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pessoa pessoas;
  v_ativos int;
begin
  perform _exigir(eh_admin());
  select * into v_pessoa from pessoas where cpf = normalizar_cpf(p_cpf);
  perform _exigir(found, 'NAO_ENCONTRADO: nenhum cadastro com esse CPF');
  select count(*) into v_ativos from ingressos i join eventos e on e.id = i.evento_id
  where i.pessoa_id = v_pessoa.id and e.inicio > now() and status_consome(i.status);
  perform _exigir(v_ativos = 0, format('TEM_INGRESSO_ATIVO: %s tem %s ingresso(s) para jogos futuros; cancele antes de anonimizar', v_pessoa.nome, v_ativos));
  perform _anonimizar_pessoas(array[v_pessoa.id]);
  update envios set para_email = 'anonimizado', para_nome = null, corpo = '[conteúdo removido a pedido do titular]'
  where lower(para_email) = lower(coalesce(v_pessoa.email, '-'));
  perform registrar_auditoria('anonimizar', 'lgpd', v_pessoa.id::text, jsonb_build_object('motivo', 'pedido do titular'));
  return jsonb_build_object('nome', v_pessoa.nome);
end $$;

-- Resumo para a tela de privacidade
create or replace function resumo_lgpd()
returns table (retencao_meses int, pessoas_total int, pessoas_anonimizadas int, a_anonimizar int)
language sql stable security definer set search_path = public as $$
  with r as (select coalesce((select (valor #>> '{}')::int from config where chave = 'retencao_meses'), 12) as meses)
  select r.meses,
         (select count(*)::int from pessoas),
         (select count(*)::int from pessoas where anonimizada_em is not null),
         (select count(*)::int from pessoas_para_anonimizar(r.meses))
  from r where eh_admin()
$$;

revoke execute on function dashboard_eventos(), historico_areas(timestamptz), historico_pessoas(timestamptz, int), historico_eventos(timestamptz),
  relatorio_evento(uuid), _anonimizar_pessoas(uuid[]), pessoas_para_anonimizar(int), anonimizar_por_retencao(int), anonimizar_titular(text), resumo_lgpd()
  from public, anon;
grant execute on function dashboard_eventos(), historico_areas(timestamptz), historico_pessoas(timestamptz, int), historico_eventos(timestamptz),
  relatorio_evento(uuid), anonimizar_por_retencao(int), anonimizar_titular(text), resumo_lgpd() to authenticated, service_role;
revoke execute on function _anonimizar_pessoas(uuid[]), pessoas_para_anonimizar(int) from authenticated;
grant execute on function _anonimizar_pessoas(uuid[]), pessoas_para_anonimizar(int) to service_role;
