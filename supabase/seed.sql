-- Dados de exemplo para desenvolvimento local (supabase db reset). TODOS FICTÍCIOS.
-- Estrutura baseada na planilha do jogo Galo × Montevideo (14/10): colaborador + 1 convidado
-- na arquibancada, Presidência com 1 ingresso por pessoa, camarote por indicação.
--
-- Usuários (login por magic link; no ambiente local os e-mails chegam no Inbucket/Mailpit,
-- http://127.0.0.1:54324):
--   admin@exemplo.com           Admin
--   marketing@exemplo.com       Marketing MRV
--   responsavel.<slug>@exemplo.com  Responsável de cada área (ex.: responsavel.dh@exemplo.com)
--   operacao@exemplo.com        Operação do camarote

create or replace function pg_temp.cpf_fake(n int) returns text language plpgsql as $$
declare d int[]; s int; base text := lpad(((n * 7919 + 100000000) % 1000000000)::text, 9, '0');
begin
  d := array(select substr(base, i, 1)::int from generate_series(1, 9) i);
  for k in 9..10 loop
    s := 0;
    for i in 1..k loop s := s + d[i] * (k + 2 - i); end loop;
    d := d || ((s * 10) % 11 % 10);
  end loop;
  return array_to_string(d, '');
end $$;

-- data relativa a hoje, no horário de Brasília
create or replace function pg_temp.brt(p_dias int, p_hora text) returns text language sql as $$
  select ((current_date + p_dias)::text || ' ' || p_hora || ':00-03')
$$;

create or replace function pg_temp.criar_usuario(p_email text, p_nome text, p_papel papel_usuario) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email, '', now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('nome', p_nome), now(), now());
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
  insert into perfis (user_id, nome, email, papel) values (v_id, p_nome, p_email, p_papel);
  return v_id;
end $$;

do $$
declare
  v_admin uuid;
  v_resp uuid;
  ar record;
  v_ev uuid;
  v_ev_ant uuid;
  n int := 0;
  i int;
  nomes text[] := array['Ana Paula Ribeiro','Bruno Henrique Alves','Camila Duarte','Diego Martins','Eduarda Lima','Felipe Araújo',
    'Gabriela Rocha','Henrique Moreira','Isabela Castro','João Victor Nunes','Karina Mendes','Lucas Fernandes','Mariana Teixeira',
    'Nathan Carvalho','Olivia Batista','Pedro Augusto Reis','Rafaela Pires','Samuel Costa','Tatiana Gomes','Vinícius Prado'];
begin
  v_admin := pg_temp.criar_usuario('admin@exemplo.com', 'Admin act.3', 'admin');
  perform pg_temp.criar_usuario('marketing@exemplo.com', 'Gestora Marketing', 'marketing');
  perform pg_temp.criar_usuario('operacao@exemplo.com', 'Operação Camarote', 'operacao');
  -- a área Marketing é gerida pelo próprio perfil Marketing (sem responsável separado)
  for ar in select id, slug, nome from areas where slug <> 'marketing' order by ordem loop
    v_resp := pg_temp.criar_usuario('responsavel.' || ar.slug || '@exemplo.com', 'Responsável ' || ar.nome, 'responsavel');
    insert into area_responsaveis (area_id, user_id) values (ar.id, v_resp);
  end loop;

  -- age como o admin (as funções checam o perfil)
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  -- evento passado, já enviado (histórico)
  v_ev_ant := criar_evento(jsonb_build_object('titulo', 'Galo × Montevideo', 'adversario', 'Montevideo', 'competicao', 'Sul-Americana',
    'inicio', pg_temp.brt(-20, '21:30'), 'status', 'aberto'));
  for ar in select id, slug from areas where slug in ('dh', 'luggo', 'producao', 'presidencia') loop
    for i in 1..2 loop
      n := n + 1;
      perform criar_pedido(v_ev_ant, 'arquibancada', ar.id,
        case when ar.slug = 'presidencia'
          then jsonb_build_array(jsonb_build_object('nome', nomes[1 + n % 20] || ' Ex', 'cpf', pg_temp.cpf_fake(n), 'status', 'enviado'))
          else jsonb_build_array(
            jsonb_build_object('nome', nomes[1 + n % 20] || ' Ex', 'cpf', pg_temp.cpf_fake(n), 'status', 'enviado'),
            jsonb_build_object('nome', 'Convidado de ' || nomes[1 + n % 20], 'cpf', pg_temp.cpf_fake(n + 500), 'status', case when i = 2 then 'no_show' else 'enviado' end))
        end,
        '{"origem":"importacao","ignorar_cota":true}');
    end loop;
  end loop;
  update eventos set status = 'realizado' where id = v_ev_ant;

  -- próximo jogo, aberto, com pedidos em várias etapas
  v_ev := criar_evento(jsonb_build_object('titulo', 'Galo × Cruzeiro', 'adversario', 'Cruzeiro', 'competicao', 'Brasileirão',
    'inicio', pg_temp.brt(10, '16:00'),
    'abertura_portoes', pg_temp.brt(10, '14:00'),
    'prazo_solicitacao', pg_temp.brt(7, '18:00'),
    'prazo_validacao', pg_temp.brt(8, '12:00'),
    'concorrido', true, 'status', 'aberto'));

  n := 100;
  for ar in select id, slug from areas where slug in ('dh', 'marketing', 'comercial-corporativo', 'di', 'urba') loop
    for i in 1..3 loop
      n := n + 1;
      perform criar_pedido(v_ev, 'arquibancada', ar.id, jsonb_build_array(
        jsonb_build_object('nome', nomes[1 + n % 20], 'cpf', pg_temp.cpf_fake(n), 'celular', '319' || lpad((90000000 + n)::text, 8, '0'), 'email', 'colab' || n || '@exemplo.com'),
        jsonb_build_object('nome', 'Acompanhante ' || nomes[1 + (n + 7) % 20], 'cpf', pg_temp.cpf_fake(n + 900), 'celular', '319' || lpad((80000000 + n)::text, 8, '0'))),
        '{"origem":"responsavel"}');
    end loop;
  end loop;
  -- DH e Marketing validaram; parte já aprovada e com o passo a passo do Galo ID enviado
  perform validar_lista(v_ev, 'arquibancada', (select id from areas where slug = 'dh'));
  perform validar_lista(v_ev, 'arquibancada', (select id from areas where slug = 'marketing'));
  perform aprovar_ingressos(array(select i.id from ingressos i join areas x on x.id = i.area_id where i.evento_id = v_ev and x.slug = 'dh'));
  perform marcar_orientacao_enviada(array(select i.id from ingressos i join areas x on x.id = i.area_id where i.evento_id = v_ev and x.slug = 'dh'));
  perform marcar_facial_ok(array(select i.id from ingressos i join areas x on x.id = i.area_id where i.evento_id = v_ev and x.slug = 'dh' and i.convidado_de is null));

  -- Luggo (cota 6) cheia + 1 pedido na lista de espera
  for i in 1..4 loop
    n := n + 1;
    perform criar_pedido(v_ev, 'arquibancada', (select id from areas where slug = 'luggo'), jsonb_build_array(
      jsonb_build_object('nome', nomes[1 + n % 20] || ' Luggo', 'cpf', pg_temp.cpf_fake(n), 'celular', '3198' || lpad(n::text, 7, '0')),
      jsonb_build_object('nome', 'Convidado Luggo ' || i, 'cpf', pg_temp.cpf_fake(n + 900), 'celular', '3197' || lpad(n::text, 7, '0'))),
      '{"origem":"responsavel"}');
  end loop;

  -- Modo B: vagas aguardando o convidado
  perform criar_convite(v_ev, 'arquibancada', (select id from areas where slug = 'producao'), 2, 'Equipe de obra – Produção', '31990001111', null);
  perform criar_convite(v_ev, 'arquibancada', (select id from areas where slug = 'presidencia'), 1, 'Convidado da Presidência', null, null);

  -- Camarote: anfitrião + convidados
  n := n + 1;
  perform criar_pedido(v_ev, 'camarote', (select id from areas where slug = 'presidencia'), jsonb_build_array(
    jsonb_build_object('nome', 'Anfitrião Diretoria', 'cpf', pg_temp.cpf_fake(n), 'celular', '31991112222', 'colaborador', true),
    jsonb_build_object('nome', 'Investidor Convidado', 'cpf', pg_temp.cpf_fake(n + 1), 'celular', '31991113333'),
    jsonb_build_object('nome', 'Parceira Convidada', 'cpf', pg_temp.cpf_fake(n + 2), 'celular', '31991114444')),
    '{"origem":"marketing","prioridade":"exec_presidencia","catering":"corporativo","centro_custo":"CC-1000","indicacao_de":"Presidência"}');
  -- jogo concorrido: pedidos de camarote entram na fila; o Marketing distribui pela prioridade
  perform distribuir_camarote(v_ev);
  perform criar_pedido(v_ev, 'camarote', (select id from areas where slug = 'comercial-corporativo'), jsonb_build_array(
    jsonb_build_object('nome', 'Diretor Comercial', 'cpf', pg_temp.cpf_fake(n + 3)),
    jsonb_build_object('nome', 'Cliente Construtora', 'cpf', pg_temp.cpf_fake(n + 4)),
    jsonb_build_object('nome', 'Cliente Incorporadora', 'cpf', pg_temp.cpf_fake(n + 5))),
    '{"origem":"marketing","prioridade":"diretor","catering":"pessoal","indicacao_de":"Diretoria Comercial"}');
  perform criar_pedido(v_ev, 'camarote', (select id from areas where slug = 'dh'), jsonb_build_array(
    jsonb_build_object('nome', 'Gestora DH', 'cpf', pg_temp.cpf_fake(n + 6)),
    jsonb_build_object('nome', 'Colaborador Destaque', 'cpf', pg_temp.cpf_fake(n + 7))),
    '{"origem":"marketing","prioridade":"gestor","catering":"corporativo","centro_custo":"CC-2040","observacao":"Reconhecimento do time"}');
end $$;
