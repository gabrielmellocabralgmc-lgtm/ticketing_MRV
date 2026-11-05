-- O link direto do ingresso (/i/<token>/ingresso) funciona assim que o ingresso é distribuído,
-- para a equipe poder copiar e mandar "por fora" (WhatsApp etc.). A página do convidado continua
-- mostrando o botão "Baixar meu ingresso" só depois do envio (dig_do_token).
create or replace function dig_arquivo_do_token(p_token text)
returns table (tipo text, url text, caminho text, nome_arquivo text)
language sql stable security definer set search_path = public as $$
  select d.tipo, d.url, d.caminho, d.nome_arquivo
  from ingressos i join ingressos_digitais d on d.ingresso_id = i.id
  where i.token = p_token and i.status in ('facial_ok', 'enviado', 'confirmado', 'presente')
$$;
revoke execute on function dig_arquivo_do_token(text) from public, anon, authenticated;
grant execute on function dig_arquivo_do_token(text) to service_role;
