-- Admin corrige o e-mail de um convidado, mesmo depois de validado e com o ingresso já enviado.
-- Só o contato muda: o ingresso, o link, a distribuição e o histórico de envios continuam iguais.
create or replace function alterar_email_ingresso(p_ingresso uuid, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
  v_anterior text;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform _exigir(eh_admin(), 'SEM_PERMISSAO: só o Admin altera o e-mail do convidado');
  perform _exigir(v_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$', 'VALOR_INVALIDO: e-mail inválido');
  select * into v_ing from ingressos where id = p_ingresso for update;
  perform _exigir(found and v_ing.pessoa_id is not null, 'NAO_ENCONTRADO: convidado não encontrado');
  perform _exigir(v_ing.status <> 'cancelado', 'VALOR_INVALIDO: este ingresso foi cancelado');
  select email into v_anterior from pessoas where id = v_ing.pessoa_id;
  if v_anterior is not distinct from v_email then return v_email; end if;
  update pessoas set email = v_email, atualizado_em = now() where id = v_ing.pessoa_id;
  perform registrar_auditoria('alterar', 'ingresso', p_ingresso::text,
    jsonb_build_object('campo', 'email', 'anterior', v_anterior, 'novo', v_email));
  return v_email;
end $$;
revoke execute on function alterar_email_ingresso(uuid, text) from public, anon;
grant execute on function alterar_email_ingresso(uuid, text) to authenticated, service_role;
