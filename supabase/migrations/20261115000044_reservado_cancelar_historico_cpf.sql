-- Novos status e funções para jogos do Galo: reservado, cancelar, histórico por CPF.

-- 1. Adicionar "reservado" ao enum (antes de "solicitado")
-- PostgreSQL não permite adicionar no meio, então recriamos o enum
alter type status_ingresso rename to status_ingresso_old;

create type status_ingresso as enum (
  'reservado',                -- novo: apenas Admin pode criar (antes de solicitado)
  'convite_enviado',          -- vaga do Modo B criada, link gerado
  'aguardando_preenchimento', -- convidado abriu o link
  'solicitado',
  'validado_area',
  'aprovado',
  'facial_pendente',          -- passo a passo do Galo ID enviado
  'facial_ok',                -- torcedor confirmou a biometria
  'enviado',                  -- ingresso enviado no sistema do Atlético
  'confirmado',               -- torcedor recebeu/aceitou o ingresso
  'presente',
  'convite_expirado',
  'lista_espera',
  'recusado',
  'cancelado',
  'no_show'
);

-- Migrar as colunas de status para o novo enum
alter table ingressos alter column status type status_ingresso using status::text::status_ingresso;
alter table status_historico alter column de type status_ingresso using de::text::status_ingresso;
alter table status_historico alter column para type status_ingresso using para::text::status_ingresso;
alter table transicoes alter column de type status_ingresso using de::text::status_ingresso;
alter table transicoes alter column para type status_ingresso using para::text::status_ingresso;

-- Atualizar a função status_consome para incluir "reservado"
drop function if exists status_consome(status_ingresso);
create or replace function status_consome(s status_ingresso) returns boolean
language sql immutable as $$
  select s not in ('reservado', 'convite_expirado', 'lista_espera', 'recusado', 'cancelado')
$$;

drop type status_ingresso_old;

-- 2. Função para cancelar ingresso (remove da lista e devolve a cota)
create or replace function cancelar_ingresso(p_ingresso uuid, p_motivo text default '') returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
  v_de_cota int;
  v_para_cota int;
begin
  perform _exigir(eh_admin(), 'SEM_PERMISSAO: apenas Admin pode cancelar ingressos');

  select * into v_ing from ingressos where id = p_ingresso;
  perform _exigir(v_ing.id is not null, 'INGRESSO_NAO_EXISTE: ingresso não encontrado');
  perform _exigir(v_ing.status not in ('cancelado', 'no_show', 'presente'), 'JA_PROCESSADO: não pode cancelar este ingresso');

  -- Se estava ocupando cota, devolve
  if status_consome(v_ing.status) then
    select quantidade into v_de_cota from cotas where evento_id = v_ing.evento_id and setor = v_ing.setor and area_id = v_ing.area_id;
    v_para_cota := v_de_cota + 1;

    update cotas set quantidade = v_para_cota
    where evento_id = v_ing.evento_id and setor = v_ing.setor and area_id = v_ing.area_id;

    insert into cotas_historico (evento_id, setor, area_id, de, para, autor, motivo)
    values (v_ing.evento_id, v_ing.setor, v_ing.area_id, v_de_cota, v_para_cota, auth.uid(), 'Cancelamento de ingresso: ' || coalesce(p_motivo, ''));
  end if;

  -- Atualizar para cancelado
  update ingressos set status = 'cancelado', atualizado_em = now() where id = p_ingresso;

  insert into status_historico (ingresso_id, de, para, autor, autor_tipo, motivo)
  values (p_ingresso, v_ing.status, 'cancelado', auth.uid(), 'usuario', p_motivo);

  perform registrar_auditoria('cancelar', 'ingresso', p_ingresso::text, jsonb_build_object('de', v_ing.status, 'motivo', p_motivo));

  return 'cancelado';
end $$;

-- 3. Função para buscar histórico por CPF (pré-preenchimento no formulário Admin)
-- Retorna a pessoa mais recente com esse CPF em qualquer evento anterior
create or replace function buscar_historico_cpf(p_cpf text) returns table (
  pessoa_id uuid,
  nome text,
  email text,
  celular text,
  ultimo_evento text,
  ultimo_evento_em timestamptz,
  status_anterior status_ingresso
) language sql stable as $$
  select distinct on (p.id)
    p.id,
    p.nome,
    p.email,
    p.celular,
    e.titulo,
    i.criado_em,
    i.status
  from pessoas p
  join ingressos i on i.pessoa_id = p.id
  join eventos e on e.id = i.evento_id
  where p.cpf = normalizar_cpf(p_cpf)
  order by p.id, i.criado_em desc
  limit 1
$$;

-- 4. Função para reservar ingresso (cria um ingresso com status "reservado")
-- Uso: Admin clica em "Reservar X ingressos" → calcula cota, cria ingressos reservados
create or replace function reservar_ingressos(
  p_evento uuid,
  p_setor setor,
  p_area_id uuid,
  p_qtd int,
  p_motivo text default 'Reserva do Admin'
) returns table (ingresso_id uuid, status text) language plpgsql security definer set search_path = public as $$
declare
  v_cota int;
  v_nova_cota int;
  v_pedido_id uuid;
  i int;
begin
  perform _exigir(eh_admin(), 'SEM_PERMISSAO: apenas Admin pode reservar ingressos');

  -- Verificar cota disponível
  select quantidade into v_cota from cotas where evento_id = p_evento and setor = p_setor and area_id = p_area_id;
  perform _exigir(v_cota >= p_qtd, 'COTA_INSUFICIENTE: não há cota suficiente para reservar');

  -- Criar pedido para alocar esses ingressos
  insert into pedidos (evento_id, setor, area_id, origem, solicitante)
  values (p_evento, p_setor, p_area_id, 'importacao', auth.uid())
  returning id into v_pedido_id;

  -- Criar N ingressos com status "reservado"
  for i in 1..p_qtd loop
    insert into ingressos (evento_id, setor, area_id, pedido_id, status, preenchido_por, token)
    values (p_evento, p_setor, p_area_id, v_pedido_id, 'reservado', 'responsavel', gerar_token())
    returning id, status::text into ingresso_id, status;
    return next;
  end loop;

  -- Decrementar cota
  v_nova_cota := v_cota - p_qtd;
  update cotas set quantidade = v_nova_cota where evento_id = p_evento and setor = p_setor and area_id = p_area_id;

  insert into cotas_historico (evento_id, setor, area_id, de, para, autor, motivo)
  values (p_evento, p_setor, p_area_id, v_cota, v_nova_cota, auth.uid(), p_motivo);
end $$;
