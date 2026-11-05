-- Excluir um evento (só Admin): apaga tudo dele em cascata (cotas, pedidos, ingressos, convites,
-- ingressos digitais, operação do camarote, e-mails registrados) e os arquivos guardados no banco
-- (PDFs dos ingressos e fotos da operação). Fica registrado na auditoria.
create or replace function excluir_evento(p_evento uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_titulo text;
begin
  perform _exigir(eh_admin());
  select titulo into v_titulo from eventos where id = p_evento;
  perform _exigir(found, 'NAO_ENCONTRADO: evento não encontrado');
  perform registrar_auditoria('excluir', 'evento', p_evento::text, jsonb_build_object('titulo', v_titulo));
  delete from op_arquivos where caminho like 'dig/' || p_evento::text || '/%' or caminho like p_evento::text || '/%';
  delete from eventos where id = p_evento;
  return v_titulo;
end $$;
revoke execute on function excluir_evento(uuid) from public, anon;
grant execute on function excluir_evento(uuid) to authenticated, service_role;
