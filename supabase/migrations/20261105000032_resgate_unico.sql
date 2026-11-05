-- Ingresso por LINK DE RESGATE DE USO ÚNICO (ex.: transferência Eventim), configurado por evento.
-- O link nunca aparece no e-mail nem na tela da equipe: o convidado abre a página pessoal, lê o
-- passo a passo (app, conta própria, login), confirma que é ele quem vai e só então o sistema
-- revela o link, uma única vez. Há 30 min de tolerância para tentar de novo (ex.: não estava
-- logado no app); depois disso fica travado e só a equipe pode liberar um novo resgate.
-- Também: orientações extras do evento para o convidado (página pessoal e e-mail do ingresso).

alter table eventos
  add column resgate_unico boolean not null default false,
  add column orientacoes_convidado text;

alter table ingressos_digitais
  add column resgate_aberto_em timestamptz,
  add column resgate_vezes int not null default 0;

-- Estado do resgate para a página do convidado (sem o link)
create or replace function dig_resgate_estado(p_token text)
returns table (aberto_em timestamptz, expira_em timestamptz, travado boolean)
language sql stable security definer set search_path = public as $$
  select d.resgate_aberto_em,
         d.resgate_aberto_em + interval '30 minutes',
         d.resgate_aberto_em is not null and (now() > d.resgate_aberto_em + interval '30 minutes' or i.status in ('confirmado', 'presente'))
  from ingressos i join ingressos_digitais d on d.ingresso_id = i.id
  where i.token = p_token and d.enviado_em is not null
$$;

-- O convidado resgata: devolve o link (só para o servidor, que redireciona) e registra o horário
create or replace function dig_resgatar(p_token text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
  v_dig ingressos_digitais;
begin
  select * into v_ing from ingressos where token = p_token;
  perform _exigir(found, 'NAO_ENCONTRADO: link inválido');
  perform _exigir((select resgate_unico from eventos where id = v_ing.evento_id), 'VALOR_INVALIDO: este evento não usa link de resgate');
  select * into v_dig from ingressos_digitais where ingresso_id = v_ing.id for update;
  perform _exigir(found and v_dig.enviado_em is not null and v_ing.status in ('enviado', 'confirmado'),
    'TRANSICAO_INVALIDA: seu ingresso ainda não foi liberado');
  perform _exigir(v_dig.tipo = 'link', 'VALOR_INVALIDO: este ingresso não é um link de resgate. Fale com o Marketing MRV.');
  perform _exigir(v_ing.status <> 'confirmado',
    'JA_RESGATADO: você já confirmou que o ingresso está no seu app. Abra o app e veja em “Meus ingressos”.');
  perform _exigir(v_dig.resgate_aberto_em is null or now() <= v_dig.resgate_aberto_em + interval '30 minutes',
    'JA_RESGATADO: este ingresso já foi resgatado em ' || to_char(v_dig.resgate_aberto_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
    || '. Se ele não apareceu no seu app, fale com o Marketing MRV.');
  update ingressos_digitais set resgate_aberto_em = coalesce(resgate_aberto_em, now()), resgate_vezes = resgate_vezes + 1
  where id = v_dig.id;
  insert into status_historico (ingresso_id, de, para, autor_tipo, motivo)
  values (v_ing.id, v_ing.status, v_ing.status, 'torcedor', 'abriu o link de resgate (' || (v_dig.resgate_vezes + 1) || 'ª vez)');
  return v_dig.url;
end $$;

-- Equipe libera um novo resgate (ex.: o convidado abriu sem estar logado e o prazo passou)
create or replace function dig_liberar_resgate(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir(eh_staff());
  update ingressos_digitais set resgate_aberto_em = null where id = p_id;
  perform registrar_auditoria('alterar', 'ingresso_digital', p_id::text, jsonb_build_object('acao', 'liberar novo resgate'));
end $$;

revoke execute on function dig_resgate_estado(text) from public, anon, authenticated;
grant execute on function dig_resgate_estado(text) to service_role;
revoke execute on function dig_resgatar(text) from public, anon, authenticated;
grant execute on function dig_resgatar(text) to service_role;
revoke execute on function dig_liberar_resgate(uuid) from public, anon;
grant execute on function dig_liberar_resgate(uuid) to authenticated, service_role;

-- Depois do resgate o ingresso já está na conta Eventim do convidado: cancelar pelo link não devolve o lugar
create or replace function acao_torcedor(p_token text, p_acao text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
begin
  select * into v_ing from ingressos where token = p_token;
  perform _exigir(found, 'NAO_ENCONTRADO: link inválido');
  if p_acao = 'facial_ok' then
    perform _exigir(v_ing.status in ('aprovado', 'facial_pendente'), 'TRANSICAO_INVALIDA: seu pedido ainda não foi aprovado');
    perform _mudar_status(v_ing.id, 'facial_ok', 'torcedor', 'torcedor confirmou a facial no Galo ID');
  elsif p_acao = 'recebido' then
    perform _exigir(v_ing.status = 'enviado', 'TRANSICAO_INVALIDA: o ingresso ainda não foi enviado');
    perform _mudar_status(v_ing.id, 'confirmado', 'torcedor', 'torcedor confirmou o recebimento');
  elsif p_acao = 'cancelar' then
    perform _exigir(not exists (select 1 from ingressos_digitais where ingresso_id = v_ing.id and resgate_aberto_em is not null),
      'JA_RESGATADO: o ingresso já foi resgatado no app. Se não puder ir, fale com o Marketing MRV.');
    perform _mudar_status(v_ing.id, 'cancelado', 'torcedor', 'torcedor cancelou pelo link');
    perform _promover_lista_espera(v_ing.evento_id, v_ing.setor, v_ing.area_id);
  else
    raise exception 'VALOR_INVALIDO: ação desconhecida';
  end if;
  return (select status::text from ingressos where id = v_ing.id);
end $$;

-- E-mail do ingresso de resgate: NÃO leva o link da Eventim, só o passo a passo e a página pessoal
insert into modelos_email (chave, nome, descricao, assunto, corpo) values
('ingresso_resgate', 'Ingresso por link de resgate (uso único)',
 'Enviado pelo botão "Enviar ingressos" nos eventos com "link de resgate de uso único" (ex.: Eventim). O botão leva à página pessoal do convidado, onde ele resgata o ingresso.',
 'Seu ingresso para {{evento}}: leia antes de resgatar',
 'Olá, {{nome}}! 🎉

Seu ingresso para {{evento}} está liberado.

📅 {{quando}}
📍 Arena MRV · {{setor}}
🚪 Portões: {{portoes}}

⚠️ ATENÇÃO: o seu ingresso é um LINK ÚNICO da Eventim. Ele só funciona UMA VEZ e deve ser resgatado por VOCÊ, que vai ao evento. Depois de resgatado, o ingresso fica na sua conta Eventim e não pode ser passado para outra pessoa.

:: ANTES DE RESGATAR (faça nesta ordem)

1. No celular que você vai levar ao evento, baixe o app EVENTIM BRASIL (App Store ou Google Play).
2. Crie a sua conta Eventim com os SEUS dados (nome, CPF e e-mail). Se já tiver conta, use a sua.
3. Entre (faça login) no app.

:: RESGATANDO O INGRESSO

4. Ainda nesse celular, toque no botão abaixo. Ele abre a sua página pessoal com o passo a passo.
5. Marque as confirmações e toque em “Resgatar meu ingresso”. O app da Eventim abre: aceite o ingresso.
6. Confira o ingresso em “Meus ingressos” no app e volte à página para tocar em “O ingresso apareceu no meu app”.

:: NO DIA DO EVENTO

• O QR code do ingresso é dinâmico e aparece no app perto do evento (até 24h antes). Print ou foto da tela não valem.
• Leve um documento com foto.
{{orientacoes}}

Não vai poder ir? Avise ANTES de resgatar, pela sua página pessoal, para o lugar ir para outra pessoa.

Bom evento!')
on conflict (chave) do nothing;
