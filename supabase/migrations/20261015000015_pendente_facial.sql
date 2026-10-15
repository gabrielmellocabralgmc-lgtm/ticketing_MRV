-- Novo fluxo da facial:
--   Preenchido (solicitado) → área valida → Pronto para envio (facial_ok).
--   Ao tentar enviar no sistema do Atlético e a facial não estiver cadastrada, a equipe marca
--   "Pendente facial" (facial_pendente). O convidado confirma pelo link ("Já tenho a facial
--   cadastrada") e volta para Pronto para envio; a equipe pode marcar de novo se não era verdade,
--   ou liberar manualmente ("Facial OK").
-- "aprovado" vira um passo de passagem: segue direto para Pronto para envio.

update transicoes set sistema = true where (de, para) = ('validado_area', 'aprovado');
insert into transicoes (de, para, papeis, torcedor, sistema) values
  ('facial_ok', 'facial_pendente', '{admin,marketing}', false, false)
on conflict (de, para) do nothing;

-- Validar a lista já deixa os ingressos prontos para envio
create or replace function validar_lista(p_evento uuid, p_setor setor, p_area uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  perform _exigir(responde_area(p_area));
  for v_id in select id from ingressos
              where evento_id = p_evento and setor = p_setor and area_id = p_area and status = 'solicitado' loop
    perform _mudar_status(v_id, 'validado_area', 'usuario', 'lista validada pela área');
    perform _mudar_status(v_id, 'aprovado', 'sistema', 'lista validada pela área');
    v_n := v_n + 1;
  end loop;
  insert into validacoes (evento_id, setor, area_id, validado_por, qtd) values (p_evento, p_setor, p_area, auth.uid(), v_n);
  return v_n;
end $$;

-- Todo aprovado segue para Pronto para envio (a facial é presumida; a equipe sinaliza quando faltar)
create or replace function _trg_facial() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tipo text;
  v_motivo text;
begin
  if new.pessoa_id is null then return null; end if;
  if new.status in ('facial_ok', 'enviado', 'confirmado', 'presente') and new.status is distinct from (case when tg_op = 'UPDATE' then old.status end) then
    update pessoas set facial_confirmada_em = coalesce(facial_confirmada_em, now()) where id = new.pessoa_id and facial_confirmada_em is null;
  end if;
  if new.status = 'aprovado' then
    v_tipo := current_setting('app.autor_tipo', true);
    v_motivo := current_setting('app.motivo', true);
    perform _ctx('sistema', case when pessoa_tem_facial(new.pessoa_id, new.id) then 'pronto para envio (facial já cadastrada em jogo anterior)' else 'pronto para envio' end);
    update ingressos set status = 'facial_ok' where id = new.id;
    perform _ctx(coalesce(nullif(v_tipo, ''), 'usuario'), nullif(v_motivo, ''));
  end if;
  return null;
end $$;

-- A equipe sinaliza que a facial não está cadastrada (visto no sistema do Atlético)
create or replace function marcar_facial_pendente(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  perform _exigir(eh_staff());
  v_n := _em_lote(p_ids, 'facial_pendente', 'facial não cadastrada no sistema do Atlético', array['facial_ok']::status_ingresso[]);
  update pessoas p set facial_confirmada_em = null
  from ingressos i where i.id = any (p_ids) and i.pessoa_id = p.id and i.status = 'facial_pendente';
  update ingressos set facial_em = null where id = any (p_ids) and status = 'facial_pendente';
  return v_n;
end $$;
revoke execute on function marcar_facial_pendente(uuid[]) from public, anon;
grant execute on function marcar_facial_pendente(uuid[]) to authenticated, service_role;

-- Ajusta o que já existe: aguardando aprovação ou aprovado → pronto para envio
do $$
declare v_id uuid;
begin
  perform _ctx('sistema', 'novo fluxo: validado pela área = pronto para envio');
  for v_id in select id from ingressos where status = 'validado_area' loop
    update ingressos set status = 'aprovado' where id = v_id;
  end loop;
  for v_id in select id from ingressos where status = 'aprovado' loop
    update ingressos set status = 'facial_ok' where id = v_id;
  end loop;
end $$;
