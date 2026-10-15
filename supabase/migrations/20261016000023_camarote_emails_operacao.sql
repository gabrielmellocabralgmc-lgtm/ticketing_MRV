-- 1) E-mails do camarote para 3 grupos, em ondas: VPs/Diretoria executiva (primeiro), Diretoria
--    (quando os VPs não tiverem demanda) e Gestores (quando a Diretoria não usar). Os contatos só
--    definem quem recebe: não mexem em cota nenhuma.
-- 2) Operação: bebidas com foto obrigatória antes e depois do jogo; relatório finalizado não reabre.
-- 3) Avisos por e-mail à operação: lista do camarote após o fechamento das solicitações e o
--    relatório do jogo (também para os Admins).

create table camarote_contatos (
  id uuid primary key default gen_random_uuid(),
  grupo text not null check (grupo in ('vp', 'diretoria', 'gestor')),
  nome text not null,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  cargo text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (grupo, email)
);
alter table camarote_contatos enable row level security;
create policy camarote_contatos_ler on camarote_contatos for select to authenticated using (eh_staff());
grant select on camarote_contatos to authenticated;

create or replace function salvar_contato_camarote(p_id uuid, p_grupo text, p_nome text, p_email text, p_cargo text, p_ativo boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id;
begin
  perform _exigir(eh_admin());
  perform _exigir(p_grupo in ('vp', 'diretoria', 'gestor'), 'VALOR_INVALIDO: grupo inválido');
  perform _exigir(limpar_nome(p_nome) is not null, 'DADOS_INCOMPLETOS: informe o nome');
  perform _exigir(lower(btrim(coalesce(p_email, ''))) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'EMAIL_INVALIDO: e-mail inválido');
  if v_id is null then
    insert into camarote_contatos (grupo, nome, email, cargo, ativo)
    values (p_grupo, limpar_nome(p_nome), lower(btrim(p_email)), nullif(btrim(p_cargo), ''), coalesce(p_ativo, true))
    on conflict (grupo, email) do update set nome = excluded.nome, cargo = excluded.cargo, ativo = true
    returning id into v_id;
  else
    update camarote_contatos set grupo = p_grupo, nome = limpar_nome(p_nome), email = lower(btrim(p_email)),
                                 cargo = nullif(btrim(p_cargo), ''), ativo = coalesce(p_ativo, true) where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function remover_contato_camarote(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_admin());
  delete from camarote_contatos where id = p_id;
end $$;

revoke execute on function salvar_contato_camarote(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function salvar_contato_camarote(uuid, text, text, text, text, boolean) to authenticated, service_role;
revoke execute on function remover_contato_camarote(uuid) from public, anon;
grant execute on function remover_contato_camarote(uuid) to authenticated, service_role;

-- Para onde os diretores mandam os pedidos de camarote (o e-mail do sistema é "não responda")
insert into config (chave, valor) values ('contato_camarote', '{"email": "", "whatsapp": ""}') on conflict (chave) do nothing;

-- ---------------------------------------------------------------- operação: fotos das bebidas e travas
alter table op_fotos drop constraint op_fotos_momento_check;
alter table op_fotos add constraint op_fotos_momento_check check (momento in ('antes', 'depois', 'relatorio', 'bebidas_antes', 'bebidas_depois'));

create or replace function op_concluir(p_evento uuid, p_momento text) returns void
language plpgsql security definer set search_path = public as $$
declare v_faltam int;
begin
  perform _op_aberto(p_evento, p_momento);
  select count(*) into v_faltam from op_itens i
  where i.ativo and i.momento = p_momento
    and not exists (select 1 from op_respostas r where r.evento_id = p_evento and r.item_id = i.id);
  perform _exigir(v_faltam = 0, format('INCOMPLETO: faltam %s item(ns) do check-list', v_faltam));
  if p_momento = 'antes' then
    perform _exigir(not exists (select 1 from op_bebidas b where b.ativo and not exists (
      select 1 from op_bebidas_jogo j where j.evento_id = p_evento and j.bebida_id = b.id and j.contagem_inicial is not null)),
      'INCOMPLETO: falta a contagem das bebidas antes do jogo');
    perform _exigir(exists (select 1 from op_fotos where evento_id = p_evento and momento = 'bebidas_antes'),
      'INCOMPLETO: falta a foto das bebidas antes do jogo');
  else
    perform _exigir(not exists (select 1 from op_bebidas b where b.ativo and not exists (
      select 1 from op_bebidas_jogo j where j.evento_id = p_evento and j.bebida_id = b.id and j.contagem_final is not null)),
      'INCOMPLETO: falta a contagem final das bebidas');
    perform _exigir(exists (select 1 from op_fotos where evento_id = p_evento and momento = 'bebidas_depois'),
      'INCOMPLETO: falta a foto das bebidas depois do jogo');
  end if;
  insert into op_checklists (evento_id, momento, concluido_em, concluido_por) values (p_evento, p_momento, now(), auth.uid())
  on conflict (evento_id, momento) do update set concluido_em = now(), concluido_por = auth.uid();
end $$;

-- relatório finalizado = enviado: trava tudo daquele jogo (não reabre nem reenvia)
create or replace function _op_aberto(p_evento uuid, p_momento text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_operacao());
  perform _exigir(exists (select 1 from eventos where id = p_evento), 'NAO_ENCONTRADO: evento não encontrado');
  perform _exigir(not exists (select 1 from op_relatorios where evento_id = p_evento and finalizado_em is not null),
    'JA_CONCLUIDO: o relatório deste jogo já foi enviado; nada mais pode ser alterado.');
  if p_momento is not null then
    perform _exigir(not exists (select 1 from op_checklists where evento_id = p_evento and momento = p_momento and concluido_em is not null),
      'JA_CONCLUIDO: este check-list já foi concluído. Reabra para alterar.');
  end if;
end $$;

create or replace function op_reabrir(p_evento uuid, p_momento text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_operacao());
  perform _exigir(not exists (select 1 from op_relatorios where evento_id = p_evento and finalizado_em is not null),
    'JA_CONCLUIDO: o relatório deste jogo já foi enviado; nada mais pode ser alterado.');
  update op_checklists set concluido_em = null, concluido_por = null where evento_id = p_evento and momento = p_momento;
  perform registrar_auditoria('alterar', 'op_checklist', p_evento::text, jsonb_build_object('acao', 'reabrir', 'momento', p_momento));
end $$;

-- fotos também travam depois do relatório enviado
create or replace function op_registrar_foto(p_evento uuid, p_momento text, p_item uuid, p_caminho text, p_mime text,
                                             p_tamanho int, p_legenda text default null, p_tirada_em timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v op_fotos;
begin
  perform _op_aberto(p_evento, null);
  insert into op_fotos (evento_id, momento, item_id, caminho, mime, tamanho, legenda, tirada_em, enviado_por)
  values (p_evento, p_momento, p_item, p_caminho, p_mime, p_tamanho, nullif(btrim(coalesce(p_legenda, '')), ''), p_tirada_em, auth.uid())
  returning * into v;
  return jsonb_build_object('id', v.id, 'enviado_em', v.enviado_em);
end $$;

create or replace function op_remover_foto(p_foto uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_caminho text; v_evento uuid;
begin
  select evento_id into v_evento from op_fotos where id = p_foto;
  perform _exigir(found, 'NAO_ENCONTRADO: foto não encontrada');
  perform _op_aberto(v_evento, null);
  delete from op_fotos where id = p_foto returning caminho into v_caminho;
  perform registrar_auditoria('alterar', 'op_foto', p_foto::text, jsonb_build_object('acao', 'remover'));
  return v_caminho;
end $$;

-- finalizar exige os dois check-lists concluídos; depois disso não há volta
create or replace function op_salvar_relatorio(p_evento uuid, p jsonb, p_finalizar boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _op_aberto(p_evento, null);
  if p_finalizar then
    perform _exigir((select count(*) from op_checklists where evento_id = p_evento and concluido_em is not null) = 2,
      'INCOMPLETO: conclua os check-lists de antes e depois do jogo antes de enviar o relatório');
    perform _exigir(nullif(btrim(p ->> 'resumo'), '') is not null, 'DADOS_INCOMPLETOS: escreva o resumo do jogo');
  end if;
  insert into op_relatorios (evento_id, abertura_camarote, encerramento_camarote, avaliacao, resumo, ocorrencias, manutencao, feedback,
                             finalizado_em, finalizado_por, atualizado_por)
  values (p_evento, nullif(p ->> 'abertura_camarote', '')::time, nullif(p ->> 'encerramento_camarote', '')::time,
          nullif(p ->> 'avaliacao', '')::int, nullif(btrim(p ->> 'resumo'), ''), nullif(btrim(p ->> 'ocorrencias'), ''),
          nullif(btrim(p ->> 'manutencao'), ''), nullif(btrim(p ->> 'feedback'), ''),
          case when p_finalizar then now() end, case when p_finalizar then auth.uid() end, auth.uid())
  on conflict (evento_id) do update set
    abertura_camarote = excluded.abertura_camarote, encerramento_camarote = excluded.encerramento_camarote,
    avaliacao = excluded.avaliacao, resumo = excluded.resumo, ocorrencias = excluded.ocorrencias,
    manutencao = excluded.manutencao, feedback = excluded.feedback,
    finalizado_em = excluded.finalizado_em, finalizado_por = excluded.finalizado_por,
    atualizado_em = now(), atualizado_por = auth.uid();
end $$;

drop function if exists op_reabrir_relatorio(uuid);

-- ---------------------------------------------------------------- modelos de e-mail
insert into modelos_email (chave, nome, descricao, assunto, corpo) values
('camarote_vp', 'Camarote · VPs e Diretoria executiva',
 'Primeira onda do camarote: enviado aos VPs/Diretoria executiva quando o jogo abre.',
 'Camarote MRV · {{jogo}} ({{quando}})',
 'Este é um e-mail automático. Para pedir, use o botão abaixo (não responda a este endereço).

Olá, {{nome}}!

O Camarote MRV na Arena MRV está disponível para {{jogo}}, {{quando}}. Portões: {{portoes}}.

Você tem prioridade na reserva. Se quiser usar o camarote com seus convidados, envie o pedido com o nome e o CPF de cada pessoa até {{prazo_curto}}.

📌 Pedidos: {{contato}}

Lembrete das regras do camarote: quem pede é o anfitrião e acompanha os convidados; os ingressos são individuais e vinculados ao CPF, com cadastro facial no Super App do Galo.'),
('camarote_diretoria', 'Camarote · Diretoria',
 'Segunda onda: enviado à Diretoria quando o Marketing sinaliza que os VPs não vão usar todos os lugares.',
 'Camarote MRV liberado para a Diretoria · {{jogo}}',
 'Este é um e-mail automático. Para pedir, use o botão abaixo (não responda a este endereço).

Olá, {{nome}}!

Ainda há lugares no Camarote MRV para {{jogo}}, {{quando}}. Portões: {{portoes}}.

O camarote está aberto para pedidos da Diretoria. Envie o pedido com o nome e o CPF de cada pessoa até {{prazo_curto}}. Os lugares são confirmados por ordem de pedido, conforme a disponibilidade.

📌 Pedidos: {{contato}}'),
('camarote_gestor', 'Camarote · Gestores',
 'Terceira onda: enviado aos Gestores quando a Diretoria sinaliza que não vai usar.',
 'Camarote MRV liberado para Gestores · {{jogo}}',
 'Este é um e-mail automático. Para pedir, use o botão abaixo (não responda a este endereço).

Olá, {{nome}}!

Ainda há lugares no Camarote MRV para {{jogo}}, {{quando}}. Portões: {{portoes}}.

O camarote está aberto para pedidos dos Gestores. Envie o pedido com o nome e o CPF de cada pessoa até {{prazo_curto}}. Os lugares são confirmados por ordem de pedido, conforme a disponibilidade.

📌 Pedidos: {{contato}}'),
('operacao_lista', 'Operação · lista do camarote',
 'Enviado à operação do camarote depois que as solicitações fecham, com os convidados confirmados.',
 'Camarote MRV · {{jogo}}: {{total}} convidado(s) confirmados',
 'Este é um e-mail automático. Não responda.

Olá, {{nome}}!

As solicitações para {{jogo}} ({{quando}}) foram encerradas. Portões: {{portoes}}.

Convidados confirmados no camarote até agora ({{total}}):

{{lista}}

⚠️ A lista pode mudar até o jogo (cancelamentos e inclusões do Marketing). No dia, use sempre a lista atualizada no sistema, pelo botão abaixo — é por ela que você confirma a chegada de cada convidado.'),
('operacao_relatorio', 'Operação · relatório do jogo',
 'Enviado à operação do camarote e aos Admins quando o relatório do jogo é finalizado.',
 'Relatório do camarote · {{jogo}} ({{quando}})',
 'Este é um e-mail automático. Não responda.

Relatório da operação do Camarote MRV — {{jogo}}, {{quando}}.

Presença: {{presenca}}
Abertura/encerramento do camarote: {{horarios}}
Avaliação geral: {{avaliacao}}

Resumo
{{resumo}}

Ocorrências
{{ocorrencias}}

Manutenção e pendências
{{manutencao}}

Itens com problema nos check-lists
{{problemas}}

Bebidas (consumo)
{{bebidas}}

Fotos e o relatório completo estão no link abaixo.')
on conflict (chave) do nothing;
