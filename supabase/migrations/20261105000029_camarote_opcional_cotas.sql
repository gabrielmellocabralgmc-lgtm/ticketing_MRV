-- 1) Criação do evento: "tem camarote" (sem camarote = o setor nem existe no evento), cotas
--    personalizadas antes de criar e as opções ingresso digital / facial já no mesmo passo.
-- 2) Ligar/desligar o camarote depois de criado.
-- 3) E-mails: o trecho de facial só aparece nos eventos que exigem facial ({{requisitos_facial}}).

-- p: {..., tem_camarote (padrão true), cotas: {setor: {capacidade, cota_por_area, areas: {slug: qtd}}},
--     ingressos_digitais, exige_facial}
create or replace function criar_evento(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_tipo tipo_evento := coalesce((p ->> 'tipo')::tipo_evento, 'jogo');
  v_origem uuid := nullif(p ->> 'duplicar_de', '')::uuid;
  v_camarote boolean := coalesce((p ->> 'tem_camarote')::boolean, true);
  v_padrao jsonb;
  v_setor text;
  v_cfg jsonb;
  v_slug text;
  v_qtd jsonb;
begin
  perform _exigir(eh_staff());
  insert into eventos (tipo, titulo, adversario, atracao, competicao, show_proprio, inicio, abertura_portoes,
                       prazo_solicitacao, prazo_validacao, concorrido, status, observacoes, duplicado_de, criado_por,
                       ingressos_digitais, exige_facial)
  values (v_tipo, p ->> 'titulo', p ->> 'adversario', p ->> 'atracao', p ->> 'competicao',
          (p ->> 'show_proprio')::boolean, (p ->> 'inicio')::timestamptz, (p ->> 'abertura_portoes')::timestamptz,
          (p ->> 'prazo_solicitacao')::timestamptz, (p ->> 'prazo_validacao')::timestamptz,
          false, coalesce((p ->> 'status')::status_evento, 'rascunho'),
          p ->> 'observacoes', v_origem, auth.uid(),
          (p ->> 'ingressos_digitais')::boolean, (p ->> 'exige_facial')::boolean)
  returning id into v_id;

  if v_origem is not null then
    perform _ctx('usuario', 'duplicado de evento anterior');
    insert into evento_setores (evento_id, setor, capacidade, cota_por_area)
    select v_id, setor, capacidade, cota_por_area from evento_setores
    where evento_id = v_origem and (v_camarote or setor <> 'camarote');
    insert into cotas (evento_id, setor, area_id, quantidade, sob_demanda)
    select v_id, setor, area_id, quantidade, sob_demanda from cotas
    where evento_id = v_origem and (v_camarote or setor <> 'camarote');
  else
    perform _ctx('usuario', case when p ? 'cotas' then 'cotas personalizadas na criação' else 'cota padrão do regulamento' end);
    select coalesce(p -> 'cotas', valor -> v_tipo::text) into v_padrao from config where chave = 'cotas_padrao';
    if not v_camarote then v_padrao := coalesce(v_padrao, '{}'::jsonb) - 'camarote'; end if;
    for v_setor, v_cfg in select * from jsonb_each(coalesce(v_padrao, '{}'::jsonb)) loop
      insert into evento_setores (evento_id, setor, capacidade, cota_por_area)
      values (v_id, v_setor::setor, greatest(0, (v_cfg ->> 'capacidade')::int), coalesce((v_cfg ->> 'cota_por_area')::boolean, true));
      for v_slug, v_qtd in select * from jsonb_each(coalesce(v_cfg -> 'areas', '{}'::jsonb)) loop
        insert into cotas (evento_id, setor, area_id, quantidade, sob_demanda)
        select v_id, v_setor::setor, a.id,
               greatest(0, case when jsonb_typeof(v_qtd) = 'object' then (v_qtd ->> 'quantidade')::int else v_qtd::text::int end),
               case when jsonb_typeof(v_qtd) = 'object' then coalesce((v_qtd ->> 'sob_demanda')::boolean, false) else false end
        from areas a where a.slug = v_slug;
      end loop;
    end loop;
  end if;
  perform registrar_auditoria('criar', 'evento', v_id::text, p);
  return v_id;
end $$;

-- Liga/desliga o camarote de um evento já criado
create or replace function definir_camarote(p_evento uuid, p_ativo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_tipo text; v_cap int;
begin
  perform _exigir(eh_staff());
  select tipo::text into v_tipo from eventos where id = p_evento;
  perform _exigir(found, 'NAO_ENCONTRADO: evento não encontrado');
  if p_ativo then
    select coalesce((valor -> v_tipo -> 'camarote' ->> 'capacidade')::int, 44) into v_cap from config where chave = 'cotas_padrao';
    perform _ctx('usuario', 'camarote ativado no evento');
    insert into evento_setores (evento_id, setor, capacidade, cota_por_area)
    values (p_evento, 'camarote', coalesce(v_cap, 44), false)
    on conflict do nothing;
  else
    perform _exigir(not exists (select 1 from ingressos where evento_id = p_evento and setor = 'camarote'
                                and status not in ('cancelado', 'recusado', 'convite_expirado')),
      'CAMAROTE_EM_USO: há convidados no camarote deste evento. Cancele-os antes de desativar o camarote.');
    delete from cotas where evento_id = p_evento and setor = 'camarote';
    delete from evento_setores where evento_id = p_evento and setor = 'camarote';
  end if;
end $$;
revoke execute on function definir_camarote(uuid, boolean) from public, anon;
grant execute on function definir_camarote(uuid, boolean) to authenticated, service_role;

-- E-mails: o trecho da facial vira variável (vazia quando o evento não exige facial)
update modelos_email set corpo = replace(corpo,
  '2. Tenham cadastro ativo no Super App do Galo, inclusive os acompanhantes.
3. Concluam o cadastro facial no site https://ingressos.galonaveia.com.br/',
  '{{requisitos_facial}}')
where chave = 'convocacao_area';
update modelos_email set corpo = replace(corpo,
  'os ingressos são individuais e vinculados ao CPF, com cadastro facial no Super App do Galo.',
  'os ingressos são individuais e vinculados ao CPF{{facial_frase}}.')
where chave in ('camarote_vp', 'camarote_diretoria', 'camarote_gestor');
