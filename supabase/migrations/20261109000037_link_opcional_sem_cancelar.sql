-- 1) Evento: o gestor pode (ou não) gerar links para o convidado preencher. Desligado, a área só
--    preenche os dados ela mesma (o Admin/Marketing continua podendo gerar links).
-- 2) O convidado não cancela mais pelo próprio link; os e-mails deixam de oferecer isso.

alter table eventos add column permite_link boolean not null default true;

create or replace function _trg_convite_permite_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not eh_staff() and not coalesce((select permite_link from eventos where id = new.evento_id), true) then
    raise exception 'LINK_DESATIVADO: neste evento os convidados são cadastrados pela própria área (sem link).';
  end if;
  return new;
end $$;
create trigger convites_permite_link before insert on convites
for each row execute function _trg_convite_permite_link();

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
    -- convidado não cancela mais pelo link: quem convidou (ou o Marketing) ajusta a lista
    raise exception 'SEM_CANCELAMENTO: o ingresso não pode ser cancelado por aqui. Se não puder ir, avise quem convidou você.';
  else
    raise exception 'VALOR_INVALIDO: ação desconhecida';
  end if;
  return (select status::text from ingressos where id = v_ing.id);
end $$;

-- E-mails: sem "cancele pela página pessoal"
update modelos_email set corpo = replace(corpo,
  'Se o convidado não puder ir, ele mesmo cancela pela página pessoal (o link chega com o ingresso) e o lugar volta para a sua área.',
  'Se um convidado não puder ir, troque ou cancele pela lista da área até o prazo.');
update modelos_email set corpo = replace(corpo,
  'O ingresso é pessoal e intransferível. Se não puder ir, cancele pela sua página pessoal para o lugar ir para outra pessoa.',
  'O ingresso é pessoal e intransferível. Se não puder ir, avise quem convidou você.');
update modelos_email set corpo = replace(corpo,
  'Quando estiver com o ingresso, confirme pelo botão abaixo. Não vai poder ir? Cancele pela mesma página para o lugar ir para outra pessoa.',
  'Quando estiver com o ingresso, confirme pelo botão abaixo. Não vai poder ir? Avise quem convidou você.');
update modelos_email set corpo = replace(corpo,
  'Não vai poder ir? Cancele pela sua página pessoal para o lugar ir para outra pessoa.',
  'Não vai poder ir? Avise quem convidou você.');
update modelos_email set corpo = replace(corpo,
  'Não vai poder ir? Cancele pelo link para o ingresso ir para outra pessoa.',
  'Não vai poder ir? Avise quem convidou você.');
update modelos_email set corpo = replace(corpo,
  'Não vai poder ir? Avise ANTES de resgatar, pela sua página pessoal, para o lugar ir para outra pessoa.',
  'Não vai poder ir? Avise quem convidou você ANTES de resgatar, para o lugar ir para outra pessoa.');
