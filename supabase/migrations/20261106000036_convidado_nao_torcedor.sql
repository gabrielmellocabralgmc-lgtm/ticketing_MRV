-- Nomenclatura: "convidado", não "torcedor", nos textos do histórico (o que já foi gravado e o que vier).
update status_historico set motivo = replace(motivo, 'torcedor ', 'convidado ') where motivo like 'torcedor %';

create or replace function acao_torcedor(p_token text, p_acao text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
begin
  select * into v_ing from ingressos where token = p_token;
  perform _exigir(found, 'NAO_ENCONTRADO: link inválido');
  if p_acao = 'facial_ok' then
    perform _exigir(v_ing.status in ('aprovado', 'facial_pendente'), 'TRANSICAO_INVALIDA: seu pedido ainda não foi aprovado');
    perform _mudar_status(v_ing.id, 'facial_ok', 'torcedor', 'convidado confirmou a facial no Galo ID');
  elsif p_acao = 'recebido' then
    perform _exigir(v_ing.status = 'enviado', 'TRANSICAO_INVALIDA: o ingresso ainda não foi enviado');
    perform _mudar_status(v_ing.id, 'confirmado', 'torcedor', 'convidado confirmou o recebimento');
  elsif p_acao = 'cancelar' then
    perform _exigir(not exists (select 1 from ingressos_digitais where ingresso_id = v_ing.id and resgate_aberto_em is not null),
      'JA_RESGATADO: o ingresso já foi resgatado no app. Se não puder ir, fale com o Marketing MRV.');
    perform _mudar_status(v_ing.id, 'cancelado', 'torcedor', 'convidado cancelou pelo link');
    perform _promover_lista_espera(v_ing.evento_id, v_ing.setor, v_ing.area_id);
  else
    raise exception 'VALOR_INVALIDO: ação desconhecida';
  end if;
  return (select status::text from ingressos where id = v_ing.id);
end $$;
