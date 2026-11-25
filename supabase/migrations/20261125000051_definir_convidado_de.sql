-- "Convidado de" definido à mão, pessoa por pessoa (camarote), mesmo depois do fluxo completo.
--
-- Até aqui o anfitrião de fora da lista ficava só no pedido (pedidos.anfitriao_externo) e valia
-- para todos do pedido. Agora cada ingresso pode ter o seu:
--   ingressos.convidado_de    → anfitrião que está na lista do jogo (já existia)
--   ingressos.anfitriao_texto → anfitrião de fora da lista, só deste ingresso;
--                               '' (texto vazio) = "sem anfitrião", mesmo que o pedido tenha um
--   null nos dois             → vale o do pedido (pedidos.anfitriao_externo), como antes
-- (o nome anfitriao_externo já é usado por v_ingressos para o valor efetivo, por isso "_texto")

alter table ingressos add column anfitriao_texto text check (length(anfitriao_texto) <= 200);

-- Anfitrião de fora efetivo de um ingresso (sem contar o da lista)
create or replace function anfitriao_externo_de(p_convidado_de uuid, p_texto text, p_do_pedido text) returns text
language sql immutable as $$
  select case
    when p_convidado_de is not null then null
    when p_texto is not null then nullif(p_texto, '')
    else p_do_pedido
  end
$$;

-- ---------------------------------------------------------------- v_ingressos
drop view v_ingressos;
create view v_ingressos with (security_invoker = true) as
select i.*, p.nome, p.cpf, p.celular, p.email, a.nome as area_nome, a.ordem as area_ordem,
       coalesce(pt.nome, anfitriao_externo_de(i.convidado_de, i.anfitriao_texto, pe.anfitriao_externo)) as convidado_de_nome,
       pe.indicacao_de, pe.origem, pe.prioridade, pe.catering, pe.centro_custo,
       pe.observacao as pedido_observacao, pe.manual_admin,
       anfitriao_externo_de(i.convidado_de, i.anfitriao_texto, pe.anfitriao_externo) as anfitriao_externo
from ingressos i
join areas a on a.id = i.area_id
join pedidos pe on pe.id = i.pedido_id
left join pessoas p on p.id = i.pessoa_id
left join ingressos t on t.id = i.convidado_de
left join pessoas pt on pt.id = t.pessoa_id;
grant select on v_ingressos to authenticated, service_role;

-- ---------------------------------------------------------------- definir à mão
-- p_anfitriao: ingresso de alguém ativo na lista do jogo; p_externo: nome de alguém de fora.
-- Os dois vazios = a pessoa é anfitriã (sem vínculo).
create or replace function definir_convidado_de(p_ingresso uuid, p_anfitriao uuid default null, p_externo text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
  v_anf ingressos;
  v_ext text := limpar_nome(p_externo);
  v_nome text;
begin
  perform _exigir(eh_staff(), 'SEM_PERMISSAO: apenas Admin ou Marketing podem alterar o anfitrião');
  perform _exigir(p_anfitriao is null or v_ext is null, 'VALOR_INVALIDO: escolha um anfitrião da lista OU informe um de fora, não os dois');
  select * into v_ing from ingressos where id = p_ingresso for update;
  perform _exigir(found, 'NAO_ENCONTRADO: ingresso não encontrado');

  if p_anfitriao is not null then
    perform _exigir(p_anfitriao <> p_ingresso, 'VALOR_INVALIDO: a pessoa não pode ser convidada dela mesma');
    select * into v_anf from ingressos where id = p_anfitriao;
    perform _exigir(found and v_anf.evento_id = v_ing.evento_id
                    and v_anf.status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente'),
                    'NAO_ENCONTRADO: o anfitrião escolhido não está ativo na lista deste jogo');
    perform _exigir(v_anf.convidado_de is distinct from p_ingresso,
                    'VALOR_INVALIDO: o anfitrião escolhido é convidado desta pessoa');
    select nome into v_nome from pessoas where id = v_anf.pessoa_id;
  end if;

  update ingressos set
    convidado_de = p_anfitriao,
    anfitriao_texto = case when p_anfitriao is not null then null else coalesce(v_ext, '') end
  where id = p_ingresso;

  perform registrar_auditoria('alterar', 'ingresso', p_ingresso::text,
    jsonb_build_object('convidado_de', coalesce(v_nome, v_ext, '(anfitrião)')));
  return coalesce(v_nome, v_ext);
end $$;
revoke execute on function definir_convidado_de(uuid, uuid, text) from public, anon;
grant execute on function definir_convidado_de(uuid, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------- listas (mesma regra)
create or replace function lista_area(p_evento uuid, p_setor setor, p_area uuid)
returns table (
  ingresso_id uuid, pedido_id uuid, convite_id uuid, status status_ingresso, preenchido_por preenchido_por,
  nome text, cpf text, celular text, email text, convidado_de_nome text, titular boolean,
  token text, criado_em timestamptz, convite_nome_previsto text, convite_expira_em timestamptz, convite_status status_convite,
  convite_token text, convite_contato text, convite_qtd int, indicacao_de text,
  reservado_para text, anfitriao_externo text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_staff boolean := eh_staff();
begin
  perform _exigir(responde_area(p_area));
  return query
  select i.id, i.pedido_id, i.convite_id, i.status, i.preenchido_por,
         p.nome, case when v_staff then p.cpf else mascarar_cpf(p.cpf) end, p.celular, p.email,
         coalesce(pt.nome, x.ext), i.convidado_de is null and x.ext is null, i.token, i.criado_em,
         c.nome_previsto, c.expira_em, c.status, c.token, c.contato, c.qtd_lugares, pe.indicacao_de,
         i.reservado_para, x.ext
  from ingressos i
  join pedidos pe on pe.id = i.pedido_id
  cross join lateral (select anfitriao_externo_de(i.convidado_de, i.anfitriao_texto, pe.anfitriao_externo) as ext) x
  left join pessoas p on p.id = i.pessoa_id
  left join ingressos t on t.id = i.convidado_de
  left join pessoas pt on pt.id = t.pessoa_id
  left join convites c on c.id = i.convite_id
  where i.evento_id = p_evento and i.setor = p_setor and i.area_id = p_area
  order by i.pedido_id, i.convidado_de nulls first, i.criado_em;
end $$;

create or replace function lista_camarote(p_evento uuid)
returns table (ingresso_id uuid, nome text, cpf_mascarado text, area text, anfitriao text, titular boolean,
               pedido_id uuid, indicacao_de text, chegada_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform _exigir(pode_operar());
  return query
  select i.id, p.nome, mascarar_cpf(p.cpf), a.nome,
         coalesce(pt.nome, x.ext, p.nome), i.convidado_de is null and x.ext is null,
         i.pedido_id, pe.indicacao_de, i.chegada_em
  from ingressos i
  join pessoas p on p.id = i.pessoa_id
  join areas a on a.id = i.area_id
  join pedidos pe on pe.id = i.pedido_id
  cross join lateral (select anfitriao_externo_de(i.convidado_de, i.anfitriao_texto, pe.anfitriao_externo) as ext) x
  left join ingressos t on t.id = i.convidado_de
  left join pessoas pt on pt.id = t.pessoa_id
  where i.evento_id = p_evento and i.setor = 'camarote'
    and i.status in ('aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'presente')
  order by coalesce(pt.nome, x.ext, p.nome), i.convidado_de is null and x.ext is null desc, p.nome;
end $$;
