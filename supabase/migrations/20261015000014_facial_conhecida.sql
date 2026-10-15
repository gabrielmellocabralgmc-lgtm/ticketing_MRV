-- Facial já conhecida: quem já confirmou a facial ou já teve ingresso enviado em algum jogo
-- (inclusive importado da planilha) não precisa repetir a etapa. Ao ser aprovado, vai direto
-- para "Pronto para envio" (facial_ok). Também atualiza os textos dos e-mails.

alter table pessoas add column facial_confirmada_em timestamptz;

create or replace function pessoa_tem_facial(p_pessoa uuid, p_ignorar uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from pessoas where id = p_pessoa and facial_confirmada_em is not null)
      or exists (select 1 from ingressos where pessoa_id = p_pessoa and (p_ignorar is null or id <> p_ignorar)
                   and status in ('facial_ok', 'enviado', 'confirmado', 'presente', 'no_show'))
$$;

update transicoes set sistema = true where (de, para) in (('aprovado', 'facial_ok'), ('facial_pendente', 'facial_ok'));

create or replace function _trg_facial() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tipo text;
  v_motivo text;
begin
  if new.pessoa_id is null then return null; end if;
  -- quem chega a facial OK/enviado fica registrado como tendo a facial
  if new.status in ('facial_ok', 'enviado', 'confirmado', 'presente') then
    update pessoas set facial_confirmada_em = coalesce(facial_confirmada_em, now()) where id = new.pessoa_id and facial_confirmada_em is null;
  end if;
  -- aprovado com facial já conhecida: pula a etapa
  if new.status = 'aprovado' and pessoa_tem_facial(new.pessoa_id, new.id) then
    v_tipo := current_setting('app.autor_tipo', true);
    v_motivo := current_setting('app.motivo', true);
    perform _ctx('sistema', 'facial já cadastrada (já foi a jogo pela MRV)');
    update ingressos set status = 'facial_ok', facial_em = coalesce(facial_em, now()) where id = new.id;
    perform _ctx(coalesce(nullif(v_tipo, ''), 'usuario'), nullif(v_motivo, ''));
  end if;
  return null;
end $$;

-- nome com "z" para rodar depois do histórico (gatilhos AFTER rodam em ordem alfabética)
create trigger ingressos_z_facial after insert or update of status, pessoa_id on ingressos
  for each row execute function _trg_facial();

-- quem já tem histórico
update pessoas p set facial_confirmada_em = now()
where facial_confirmada_em is null
  and exists (select 1 from ingressos i where i.pessoa_id = p.id and i.status in ('facial_ok', 'enviado', 'confirmado', 'presente', 'no_show'));

-- aprovados de hoje que já têm a facial
do $$
declare v_id uuid;
begin
  perform _ctx('sistema', 'facial já cadastrada (já foi a jogo pela MRV)');
  for v_id in select i.id from ingressos i where i.status in ('aprovado', 'facial_pendente') and i.pessoa_id is not null
                and pessoa_tem_facial(i.pessoa_id, i.id) loop
    update ingressos set status = 'facial_ok', facial_em = coalesce(facial_em, now()) where id = v_id;
  end loop;
end $$;

revoke execute on function pessoa_tem_facial(uuid, uuid) from public, anon;
grant execute on function pessoa_tem_facial(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- textos dos e-mails
update modelos_email set
  assunto = 'Ingressos MRV · {{jogo}} · {{area}}: solicite até {{prazo_curto}}',
  corpo = 'Este é um e-mail automático. Não responda: todo o processo (pedido, validação e envio) é feito pelo sistema de ingressos MRV, pelo link abaixo.

Olá, pessoal! Tudo bem?

Teremos mais um jogo do Galo na nossa casa, a Arena MRV.

Reforçamos abaixo as orientações importantes para solicitação e envio dos ingressos:

:: SOBRE O EVENTO

{{jogo}} – {{quando}} | Arena MRV

:: SOLICITAÇÃO DE INGRESSOS

A cota fixa de {{area}} é de {{cota}} ingressos ({{setor}}).

Cadastre os convidados no sistema, com nome, CPF e celular de cada um (inclusive do acompanhante):
{{link}}

Você pode preencher os dados ou gerar um link para o próprio convidado preencher. Ao terminar, clique em "Validar lista".

Para receberem os ingressos, é obrigatório que todos os convidados:

1. Estejam cadastrados no sistema com os dados completos.
2. Tenham cadastro ativo no Super App do Galo, inclusive os acompanhantes.
3. Concluam o cadastro facial no site https://ingressos.galonaveia.com.br/

📌 Prazo para cadastrar os convidados: até {{prazo_curto}}.
Atenção redobrada aos prazos e cadastros: o sistema não aceita pedidos fora do prazo.

➡️ Sem a lista de convidados validada no prazo, não conseguimos liberar os ingressos.

⚠️ Importante: os ingressos ficam bloqueados para envio 24h antes da partida. Por isso, não conseguimos enviar ingressos de solicitações fora do prazo.

:: INFORMAÇÕES ADICIONAIS

1 CPF = 1 ingresso. O ingresso é pessoal e intransferível.
Os ingressos são para o setor INTER OESTE e serão disponibilizados exclusivamente no Super App do Galo, até 4h antes do jogo.',
  atualizado_em = now()
where chave = 'convocacao_area';

update modelos_email set
  assunto = 'Ingresso aprovado para {{jogo}}: confirme sua facial',
  corpo = 'Olá, {{nome}}! Seu ingresso MRV para {{jogo}} ({{data}}) foi aprovado.

A entrada na Arena MRV é feita pelo reconhecimento facial. Se você já tem a facial cadastrada, é só confirmar no botão abaixo.

Se ainda não tem:
1. Tenha cadastro ativo no Super App do Galo.
2. Faça o cadastro facial em https://ingressos.galonaveia.com.br/
3. Depois, confirme pelo botão abaixo.

O ingresso é enviado pelo Super App do Galo, até 4h antes do jogo. Setor: {{setor}}.',
  atualizado_em = now()
where chave = 'galo_id';

update modelos_email set
  corpo = 'Olá, {{nome}}! {{jogo}} é {{data}} e ainda não recebemos a confirmação da sua facial.

Sem ela, não conseguimos enviar o ingresso.

1. Tenha cadastro ativo no Super App do Galo.
2. Faça o cadastro facial em https://ingressos.galonaveia.com.br/
3. Confirme no botão abaixo.',
  atualizado_em = now()
where chave = 'lembrete_facial';

update modelos_email set
  corpo = 'Olá, {{nome}}! Seu ingresso para {{jogo}} foi enviado e está no Super App do Galo.

Confirme aqui que recebeu: {{link}}

Portões: {{portoes}}. Setor: {{setor}}. 1 CPF = 1 ingresso, pessoal e intransferível.
Não vai poder ir? Cancele pelo link para o ingresso ir para outra pessoa.',
  atualizado_em = now()
where chave = 'ingresso_enviado';

update modelos_email set nome = 'Aprovado: confirmar a facial' where chave = 'galo_id';
