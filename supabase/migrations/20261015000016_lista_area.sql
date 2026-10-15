-- Lista da área:
-- * Modo gestor: o que o gestor preenche já entra validado (pronto para envio).
-- * Modo convidado: continua precisando da validação do gestor (e-mail com a lista e o botão).
-- * Prazo único: validar e alterar convidados vale até o prazo de solicitação.

update transicoes set sistema = true where (de, para) = ('solicitado', 'validado_area');

create or replace function _dentro_do_prazo(p_evento uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select prazo_solicitacao is null or now() <= prazo_solicitacao from eventos where id = p_evento), false)
$$;

-- Valida automaticamente os ingressos preenchidos de um pedido (vão para pronto para envio)
create or replace function _auto_validar(p_pedido uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  for v_id in select id from ingressos where pedido_id = p_pedido and status = 'solicitado' order by criado_em, id loop
    perform _mudar_status(v_id, 'validado_area', 'sistema', 'preenchido pelo gestor: validado automaticamente');
    perform _mudar_status(v_id, 'aprovado', 'sistema', 'preenchido pelo gestor: validado automaticamente');
  end loop;
end $$;

create or replace function criar_pedido(p_evento uuid, p_setor setor, p_area uuid, p_pessoas jsonb, p_opcoes jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ev eventos;
  v_staff boolean := eh_staff();
  v_origem origem_pedido := coalesce((p_opcoes ->> 'origem')::origem_pedido, case when eh_staff() then 'marketing'::origem_pedido else 'responsavel'::origem_pedido end);
  v_importacao boolean := v_origem in ('importacao', 'forms');
  v_n int := jsonb_array_length(coalesce(p_pessoas, '[]'::jsonb));
  v_status status_ingresso;
  v_pedido uuid;
  v_titular uuid;
  v_pessoa uuid;
  v_ing uuid;
  v_ids uuid[] := '{}';
  v_liberar boolean := v_staff and coalesce((p_opcoes ->> 'liberar_duplicado')::boolean, false);
  p jsonb;
  i int := 0;
begin
  perform _exigir(responde_area(p_area));
  perform _exigir(v_staff or v_origem in ('responsavel', 'forms'), 'SEM_PERMISSAO: origem de pedido não permitida');
  perform _exigir(v_staff or p_setor <> 'camarote', 'CAMAROTE_MARKETING: pedidos de camarote são lançados pelo Marketing MRV');
  perform _exigir(v_n between 1 and 20, 'VALOR_INVALIDO: informe de 1 a 20 pessoas');

  select * into v_ev from eventos where id = p_evento;
  perform _exigir(found, 'NAO_ENCONTRADO: evento não encontrado');
  if not v_staff then
    perform _exigir(v_ev.status = 'aberto', 'EVENTO_FECHADO: o evento não está aberto para solicitações');
    perform _exigir(v_ev.prazo_solicitacao is null or now() <= v_ev.prazo_solicitacao, 'PRAZO_ENCERRADO: o prazo de solicitação terminou');
  end if;

  perform _travar_setor(p_evento, p_setor);
  if v_staff and coalesce((p_opcoes ->> 'ignorar_cota')::boolean, false) then
    v_status := 'solicitado';
  elsif _cabe(p_evento, p_setor, p_area, v_n) then
    v_status := 'solicitado';
  elsif coalesce((p_opcoes ->> 'lista_espera')::boolean, true) then
    v_status := 'lista_espera';
  else
    raise exception 'COTA_EXCEDIDA: a área não tem saldo para % ingresso(s) (saldo: %)',
      v_n, (select s.saldo from saldo(p_evento, p_setor, p_area) s);
  end if;
  -- Camarote em jogo concorrido: todo pedido entra na fila e o Marketing distribui pela prioridade
  if p_setor = 'camarote' and v_ev.concorrido and not coalesce((p_opcoes ->> 'ignorar_cota')::boolean, false) then
    v_status := 'lista_espera';
  end if;
  -- O Marketing é quem aprova: o que ele mesmo lança já entra aprovado
  if v_origem = 'marketing' and v_status = 'solicitado' then v_status := 'aprovado'; end if;

  insert into pedidos (evento_id, setor, area_id, origem, solicitante, prioridade, catering, centro_custo, indicacao_de, observacao)
  values (p_evento, p_setor, p_area, v_origem, auth.uid(),
          (p_opcoes ->> 'prioridade')::prioridade_camarote, (p_opcoes ->> 'catering')::tipo_catering,
          p_opcoes ->> 'centro_custo', limpar_nome(p_opcoes ->> 'indicacao_de'), p_opcoes ->> 'observacao')
  returning id into v_pedido;

  perform _ctx('usuario', coalesce(p_opcoes ->> 'motivo', case
    when v_status = 'lista_espera' and p_setor = 'camarote' and v_ev.concorrido then 'jogo concorrido: na fila por prioridade'
    when v_status = 'lista_espera' then 'cota esgotada: entrou na lista de espera' end));
  for p in select * from jsonb_array_elements(p_pessoas) loop
    i := i + 1;
    -- Marketing cola só nome + CPF; áreas e convidados informam também o celular
    if v_origem = 'marketing' then
      perform _exigir(limpar_nome(p ->> 'nome') is not null, 'DADOS_INCOMPLETOS: informe o nome');
      perform _exigir(normalizar_cpf(p ->> 'cpf') is not null, format('DADOS_INCOMPLETOS: informe o CPF de %s', p ->> 'nome'));
    end if;
    v_pessoa := _upsert_pessoa(p || jsonb_build_object('colaborador', coalesce((p ->> 'colaborador')::boolean, i = 1 and not v_importacao)),
                               not v_importacao and v_origem <> 'marketing');
    if not v_liberar then perform _checar_duplicado(p_evento, v_pessoa); end if;
    insert into ingressos (evento_id, setor, area_id, pedido_id, pessoa_id, convidado_de, status, preenchido_por,
                           cpf_duplicado_liberado, observacao)
    values (p_evento, p_setor, p_area, v_pedido, v_pessoa, case when i > 1 then v_titular end,
            case when v_importacao and v_staff and p ? 'status' then (p ->> 'status')::status_ingresso else v_status end,
            case v_origem when 'importacao' then 'importacao'::preenchido_por when 'forms' then 'importacao'::preenchido_por
                          when 'marketing' then 'marketing'::preenchido_por else 'responsavel'::preenchido_por end,
            v_liberar, p ->> 'observacao')
    returning id into v_ing;
    if i = 1 then v_titular := v_ing; end if;
    v_ids := v_ids || v_ing;
  end loop;
  update pedidos set titular_ingresso_id = v_titular where id = v_pedido;
  -- preenchido pelo gestor da área: já entra validado (segue direto para pronto para envio)
  if v_status = 'solicitado' and v_origem = 'responsavel' then
    perform _auto_validar(v_pedido);
    v_status := 'facial_ok';
  end if;

  return jsonb_build_object('pedido_id', v_pedido, 'status', v_status, 'ingressos', to_jsonb(v_ids));
end $$;


create or replace function _promover_lista_espera(p_evento uuid, p_setor setor, p_area uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_pedido uuid;
  v_n int;
  v_total int := 0;
  v_id uuid;
begin
  if p_setor = 'camarote' and (select concorrido from eventos where id = p_evento) then return 0; end if;
  perform _travar_setor(p_evento, p_setor);
  loop
    select i.pedido_id, count(*)::int into v_pedido, v_n
    from ingressos i join pedidos pe on pe.id = i.pedido_id
    where i.evento_id = p_evento and i.setor = p_setor and i.area_id = p_area and i.status = 'lista_espera'
    group by i.pedido_id, pe.prioridade
    order by case when p_setor = 'camarote' then rank_prioridade(pe.prioridade) else 0 end, min(i.lista_espera_desde), i.pedido_id
    limit 1;
    exit when v_pedido is null or not _cabe(p_evento, p_setor, p_area, v_n);
    for v_id in select id from ingressos where pedido_id = v_pedido and status = 'lista_espera' loop
      perform _mudar_status(v_id, 'solicitado', 'sistema', 'promovido da lista de espera');
    end loop;
    -- pedido feito pelo gestor ou pelo Marketing não precisa de nova validação
    if (select origem from pedidos where id = v_pedido) in ('responsavel', 'marketing') then
      perform _auto_validar(v_pedido);
    end if;
    v_total := v_total + v_n;
    v_pedido := null;
  end loop;
  return v_total;
end $$;


create or replace function editar_pessoa_ingresso(p_ingresso uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
  v_pessoa uuid;
begin
  select * into v_ing from ingressos where id = p_ingresso for update;
  perform _exigir(found and responde_area(v_ing.area_id));
  -- a área pode trocar/corrigir convidados até o prazo de solicitação (depois, só Marketing/Admin)
  perform _exigir(eh_staff() or _dentro_do_prazo(v_ing.evento_id),
                  'PRAZO_ENCERRADO: o prazo para alterar convidados terminou. Fale com o Marketing MRV.');
  perform _exigir(eh_staff() or v_ing.status in ('solicitado', 'validado_area', 'aprovado', 'facial_ok', 'facial_pendente', 'lista_espera'),
                  'JA_ENVIADO: este ingresso já foi enviado; só o Marketing pode alterar');
  v_pessoa := _upsert_pessoa(p, true);
  if not v_ing.cpf_duplicado_liberado then perform _checar_duplicado(v_ing.evento_id, v_pessoa, v_ing.id); end if;
  update ingressos set pessoa_id = v_pessoa where id = p_ingresso;
  perform registrar_auditoria('alterar', 'ingresso', p_ingresso::text, jsonb_build_object('pessoa_anterior', v_ing.pessoa_id, 'pessoa_nova', v_pessoa));
end $$;


create or replace function cancelar_ingressos(p_ids uuid[], p_motivo text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
  r record;
begin
  -- a área só cancela até o prazo de solicitação; o convidado cancela pelo próprio link a qualquer momento
  if not eh_staff() and exists (select 1 from ingressos where id = any (p_ids) and not _dentro_do_prazo(evento_id)) then
    raise exception 'PRAZO_ENCERRADO: o prazo para alterar convidados terminou. Fale com o Marketing MRV.';
  end if;
  v_n := _em_lote(p_ids, 'cancelado', coalesce(nullif(p_motivo, ''), 'cancelado'),
                  array['solicitado', 'validado_area', 'aprovado', 'facial_pendente', 'facial_ok', 'enviado', 'confirmado', 'lista_espera']::status_ingresso[]);
  for r in select distinct evento_id, setor, area_id from ingressos where id = any (p_ids) loop
    perform _promover_lista_espera(r.evento_id, r.setor, r.area_id);
  end loop;
  return v_n;
end $$;


-- Prazo único: o de validação passa a ser o mesmo da solicitação
update eventos set prazo_validacao = prazo_solicitacao where prazo_validacao is distinct from prazo_solicitacao;
create or replace function _trg_prazo_unico() returns trigger
language plpgsql as $$
begin
  new.prazo_validacao := new.prazo_solicitacao;
  return new;
end $$;
create trigger eventos_prazo_unico before insert or update of prazo_solicitacao, prazo_validacao on eventos
  for each row execute function _trg_prazo_unico();

-- Modo convidado: o gestor valida até o mesmo prazo da solicitação
create or replace function validar_lista(p_evento uuid, p_setor setor, p_area uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  perform _exigir(responde_area(p_area));
  perform _exigir(eh_staff() or _dentro_do_prazo(p_evento), 'PRAZO_ENCERRADO: o prazo para validar a lista terminou. Fale com o Marketing MRV.');
  for v_id in select id from ingressos
              where evento_id = p_evento and setor = p_setor and area_id = p_area and status = 'solicitado' loop
    perform _mudar_status(v_id, 'validado_area', 'usuario', 'lista validada pelo gestor');
    perform _mudar_status(v_id, 'aprovado', 'sistema', 'lista validada pelo gestor');
    v_n := v_n + 1;
  end loop;
  insert into validacoes (evento_id, setor, area_id, validado_por, qtd) values (p_evento, p_setor, p_area, auth.uid(), v_n);
  return v_n;
end $$;

revoke execute on function _dentro_do_prazo(uuid), _auto_validar(uuid) from public, anon, authenticated;
grant execute on function _dentro_do_prazo(uuid), _auto_validar(uuid) to service_role;

-- E-mail ao gestor: convidados que preencheram pelo link e aguardam a validação
insert into modelos_email (chave, nome, descricao, assunto, corpo) values
('validacao_pendente', 'Lista para validar (modo convidado)',
 'Enviado ao gestor da área quando convidados preenchem pelo link e aguardam validação (no máximo a cada 12 h, até o prazo).',
 '{{area}}: {{pendentes}} convidado(s) aguardando sua validação · {{jogo}}',
 'Este é um e-mail automático. Não responda: a validação é feita pelo sistema, no botão abaixo.

Olá, {{responsavel}}!

Estes convidados preencheram os dados pelo link e aguardam a sua validação para {{jogo}} ({{quando}}):

{{lista}}

📌 Valide até {{prazo_curto}}. Depois do prazo, a lista não pode mais ser validada nem alterada, e os ingressos não são enviados.

Confira os nomes e clique em "Validar lista":
{{link}}')
on conflict (chave) do nothing;

-- Textos padrão alinhados aos dois modos (só troca se o trecho original ainda estiver lá)
update modelos_email set corpo = replace(corpo,
  'Você pode preencher os dados ou gerar um link para o próprio convidado preencher. Ao terminar, clique em "Validar lista".',
  'Você escolhe como preencher:
• Modo preenchimento pelo gestor: você digita os dados e eles já ficam validados. Dá para trocar nomes até o fim do prazo.
• Modo preenchimento pelo próprio convidado: você gera um link, o convidado preenche e você valida a lista no sistema, no mesmo prazo.')
where chave = 'convocacao_area';
update modelos_email set nome = 'Convite para o convidado (modo convidado)' where chave = 'convite_convidado' and nome = 'Convite para o convidado (Modo B)';
