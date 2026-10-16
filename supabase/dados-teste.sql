-- CARGA DE TESTE para o ambiente publicado (Railway + Neon). Roda uma vez, no deploy, quando
-- CARGA_TESTE=1 (ver scripts/migrar.mjs). Remover tudo: CARGA_TESTE=remover.
--  · Jogos REAIS do Galo em casa (Arena MRV), com convidados FICTÍCIOS.
--  · Usuários fictícios com e-mails @teste.invalid (domínio que não existe: nenhum e-mail real).
--  · CPFs fictícios (válidos só no dígito verificador).
-- Marcador: eventos com observacoes = 'DADOS DE TESTE'.

create or replace function pg_temp.cpf_teste(n int) returns text language plpgsql as $$
declare d int[]; s int; base text := lpad(((n * 104729 + 300000000) % 1000000000)::text, 9, '0');
begin
  d := array(select substr(base, i, 1)::int from generate_series(1, 9) i);
  for k in 9..10 loop
    s := 0;
    for i in 1..k loop s := s + d[i] * (k + 2 - i); end loop;
    d := d || ((s * 10) % 11 % 10);
  end loop;
  return array_to_string(d, '');
end $$;

create or replace function pg_temp.usuario_teste(p_email text, p_nome text, p_papel papel_usuario) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into auth.users (email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
  values (p_email, jsonb_build_object('nome', p_nome), now(), now(), now())
  on conflict (email) do update set updated_at = now() returning id into v_id;
  insert into perfis (user_id, nome, email, papel, ativo) values (v_id, p_nome, p_email, p_papel, true)
  on conflict (user_id) do update set nome = excluded.nome, papel = excluded.papel, ativo = true;
  return v_id;
end $$;

create or replace function pg_temp.pessoa(n int, nome text) returns jsonb language sql as $$
  select jsonb_build_object('nome', nome, 'cpf', pg_temp.cpf_teste(n), 'celular', '3199' || lpad((n % 10000000)::text, 7, '0'))
$$;

do $$
declare
  v_admin uuid;
  v_resp uuid;
  ar record;
  v_cor uuid; v_cru uuid; v_cort uuid; v_vas uuid;
  r jsonb;
  v_ids uuid[] := '{}';
  v_enviar uuid[] := '{}';
  v_facial uuid[] := '{}';
  v_anf uuid;
  n int := 0;
  i int;
  nomes text[] := array['Ana Beatriz Rocha','Bruno Carvalho','Carolina Mendes','Daniel Teixeira','Elisa Fonseca',
    'Fábio Martins','Gabriela Nunes','Henrique Lopes','Isadora Campos','João Pedro Alves','Karen Souza','Leonardo Prado',
    'Marina Cardoso','Nicolas Ferreira','Olívia Ramos','Paulo Henrique Dias','Renata Barros','Sérgio Moura','Talita Reis',
    'Vítor Andrade','Amanda Freitas','Caio Ribeiro','Débora Lima','Eduardo Pires','Fernanda Castro','Gustavo Melo',
    'Helena Duarte','Igor Santana','Juliana Rezende','Lucas Batista'];
  nm text;
begin
  if exists (select 1 from eventos where observacoes = 'DADOS DE TESTE') then
    raise notice 'carga de teste já existe — nada a fazer';
    return;
  end if;
  select user_id into v_admin from perfis where papel = 'admin' and ativo order by email limit 1;
  if v_admin is null then raise exception 'crie o Admin antes da carga de teste (ADMIN_EMAIL)'; end if;
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  -- ---------------------------------------------------------------- usuários fictícios
  perform pg_temp.usuario_teste('marketing.teste@teste.invalid', 'Gestora Marketing (teste)', 'marketing');
  perform pg_temp.usuario_teste('operacao.teste@teste.invalid', 'Operação Camarote (teste)', 'operacao');
  for ar in select id, slug, nome from areas where slug in ('dh', 'comercial-corporativo', 'producao', 'luggo', 'presidencia', 'di', 'urba') loop
    v_resp := pg_temp.usuario_teste('gestor.' || ar.slug || '@teste.invalid', 'Gestor ' || ar.nome || ' (teste)', 'responsavel');
    insert into area_responsaveis (area_id, user_id) values (ar.id, v_resp) on conflict do nothing;
  end loop;
  insert into camarote_contatos (grupo, nome, email, cargo) values
    ('vp', 'VP Teste Um', 'vp1@teste.invalid', 'VP Comercial'),
    ('vp', 'VP Teste Dois', 'vp2@teste.invalid', 'VP Financeiro'),
    ('diretoria', 'Diretora Teste', 'diretora@teste.invalid', 'Diretora de Marketing'),
    ('gestor', 'Gestor Teste', 'gestor.camarote@teste.invalid', 'Gerente Regional')
  on conflict do nothing;

  -- ---------------------------------------------------------------- jogos reais em casa
  v_cor := criar_evento(jsonb_build_object('tipo', 'jogo', 'titulo', 'Galo × Coritiba', 'adversario', 'Coritiba', 'competicao', 'Brasileirão',
    'inicio', '2026-10-17 18:30:00-03', 'abertura_portoes', '2026-10-17 15:30:00-03',
    'prazo_solicitacao', '2026-10-16 18:00:00-03', 'status', 'aberto', 'observacoes', 'DADOS DE TESTE'));
  v_cru := criar_evento(jsonb_build_object('tipo', 'jogo', 'titulo', 'Galo × Cruzeiro', 'adversario', 'Cruzeiro', 'competicao', 'Brasileirão',
    'inicio', '2026-10-29 19:30:00-03', 'abertura_portoes', '2026-10-29 16:30:00-03',
    'prazo_solicitacao', '2026-10-26 18:00:00-03', 'status', 'aberto', 'observacoes', 'DADOS DE TESTE'));
  v_cort := criar_evento(jsonb_build_object('tipo', 'jogo', 'titulo', 'Galo × Corinthians', 'adversario', 'Corinthians', 'competicao', 'Brasileirão',
    'inicio', '2026-11-22 18:00:00-03', 'abertura_portoes', '2026-11-22 15:00:00-03',
    'prazo_solicitacao', '2026-11-19 18:00:00-03', 'status', 'aberto', 'observacoes', 'DADOS DE TESTE'));
  v_vas := criar_evento(jsonb_build_object('tipo', 'jogo', 'titulo', 'Galo × Vasco', 'adversario', 'Vasco', 'competicao', 'Brasileirão',
    'inicio', '2026-11-29 18:00:00-03', 'abertura_portoes', '2026-11-29 15:00:00-03',
    'prazo_solicitacao', '2026-11-26 18:00:00-03', 'status', 'rascunho', 'observacoes', 'DADOS DE TESTE'));

  -- ---------------------------------------------------------------- Coritiba (amanhã): lista quase fechada
  -- arquibancada: gestores preencheram (já validados); parte já enviada; alguns sem facial
  for ar in select id, slug from areas where slug in ('dh', 'comercial-corporativo', 'producao', 'luggo', 'di') loop
    for i in 1..2 loop
      n := n + 1;
      r := criar_pedido(v_cor, 'arquibancada', ar.id,
        jsonb_build_array(pg_temp.pessoa(n, nomes[1 + n % 30]), pg_temp.pessoa(n + 500, nomes[1 + (n + 13) % 30] || ' (acomp.)')),
        '{"origem":"responsavel"}');
      select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(r -> 'ingressos') x;
      if n % 3 = 0 then v_facial := v_facial || v_ids[2]; elsif n % 2 = 0 then v_enviar := v_enviar || v_ids; end if;
    end loop;
  end loop;
  perform marcar_facial_pendente(v_facial);
  perform marcar_enviados(v_enviar, true);

  -- camarote: diretor na lista + convidados dele; convidados de um diretor de fora (credenciado)
  n := n + 1;
  r := criar_pedido(v_cor, 'camarote', (select id from areas where slug = 'presidencia'),
    jsonb_build_array(pg_temp.pessoa(n, 'Roberto Almeida (Diretor)')), '{"origem":"marketing","avulsos":true}');
  v_anf := (r -> 'ingressos' ->> 0)::uuid;
  perform adicionar_em_massa(v_cor, 'camarote', (select id from areas where slug = 'presidencia'),
    jsonb_build_array(pg_temp.pessoa(n + 1, 'Cláudia Vieira'), pg_temp.pessoa(n + 2, 'Marcos Antunes'), pg_temp.pessoa(n + 3, 'Patrícia Gomes')), v_anf);
  perform adicionar_em_massa(v_cor, 'camarote', (select id from areas where slug = 'comercial-corporativo'),
    jsonb_build_array(pg_temp.pessoa(n + 4, 'Cliente Construtora A'), pg_temp.pessoa(n + 5, 'Cliente Construtora B')),
    null, 'Diretor Comercial (credenciado)');
  n := n + 10;
  perform adicionar_em_massa(v_cor, 'camarote', (select id from areas where slug = 'marketing'),
    jsonb_build_array(pg_temp.pessoa(n, 'Influenciadora Convidada'), pg_temp.pessoa(n + 1, 'Fotógrafo MRV')));
  -- parte do camarote já enviada
  perform marcar_enviados(array(select id from ingressos where evento_id = v_cor and setor = 'camarote' and status = 'facial_ok' order by criado_em limit 4), true);

  -- ---------------------------------------------------------------- Cruzeiro: em andamento
  n := 200;
  for ar in select id, slug from areas where slug in ('dh', 'luggo', 'urba') loop
    for i in 1..2 loop
      n := n + 1;
      perform criar_pedido(v_cru, 'arquibancada', ar.id,
        jsonb_build_array(pg_temp.pessoa(n, nomes[1 + n % 30]), pg_temp.pessoa(n + 500, nomes[1 + (n + 7) % 30] || ' (acomp.)')),
        '{"origem":"responsavel"}');
    end loop;
  end loop;
  -- modo convidado: preencheram pelo link e aguardam a validação do gestor
  for ar in select id, slug from areas where slug in ('comercial-corporativo', 'producao') loop
    for i in 1..2 loop
      n := n + 1;
      perform preencher_convite(
        criar_convite(v_cru, 'arquibancada', ar.id, 2, nomes[1 + n % 30], null, null) ->> 'token',
        jsonb_build_array(pg_temp.pessoa(n, nomes[1 + n % 30]), pg_temp.pessoa(n + 500, nomes[1 + (n + 9) % 30] || ' (acomp.)')), true);
    end loop;
  end loop;
  -- links ainda não preenchidos
  perform criar_convite(v_cru, 'arquibancada', (select id from areas where slug = 'di'), 2, 'Equipe de obra – DI', '31990002222', null);
  perform criar_convite(v_cru, 'arquibancada', (select id from areas where slug = 'presidencia'), 1, 'Convidado da Presidência', null, null);
  -- Luggo sem saldo: pedido na lista de espera
  n := n + 1;
  for i in 1..2 loop
    n := n + 1;
    perform criar_pedido(v_cru, 'arquibancada', (select id from areas where slug = 'luggo'),
      jsonb_build_array(pg_temp.pessoa(n, nomes[1 + n % 30] || ' Luggo'), pg_temp.pessoa(n + 500, nomes[1 + (n + 3) % 30] || ' (acomp.)')),
      '{"origem":"responsavel","lista_espera":true}');
  end loop;
  -- camarote
  n := n + 20;
  r := criar_pedido(v_cru, 'camarote', (select id from areas where slug = 'presidencia'),
    jsonb_build_array(pg_temp.pessoa(n, 'Fernando Queiroz (VP)')), '{"origem":"marketing","avulsos":true}');
  perform adicionar_em_massa(v_cru, 'camarote', (select id from areas where slug = 'presidencia'),
    jsonb_build_array(pg_temp.pessoa(n + 1, 'Investidor Convidado'), pg_temp.pessoa(n + 2, 'Parceira Convidada')), (r -> 'ingressos' ->> 0)::uuid);

  -- ---------------------------------------------------------------- Corinthians: começando
  n := 400;
  for i in 1..3 loop
    n := n + 1;
    perform criar_pedido(v_cort, 'arquibancada', (select id from areas where slug = 'dh'),
      jsonb_build_array(pg_temp.pessoa(n, nomes[1 + n % 30]), pg_temp.pessoa(n + 500, nomes[1 + (n + 5) % 30] || ' (acomp.)')),
      '{"origem":"responsavel"}');
  end loop;
end $$;
