-- Row Level Security, permissões de execução e dados padrão (áreas, cotas do regulamento, transições).

-- ---------------------------------------------------------------- RLS
alter table areas enable row level security;
alter table perfis enable row level security;
alter table area_responsaveis enable row level security;
alter table eventos enable row level security;
alter table evento_setores enable row level security;
alter table cotas enable row level security;
alter table cotas_historico enable row level security;
alter table pessoas enable row level security;
alter table pedidos enable row level security;
alter table convites enable row level security;
alter table ingressos enable row level security;
alter table validacoes enable row level security;
alter table status_historico enable row level security;
alter table auditoria enable row level security;
alter table config enable row level security;
alter table transicoes enable row level security;

create policy areas_ler on areas for select to authenticated using (true);
create policy areas_admin on areas for all to authenticated using (eh_admin()) with check (eh_admin());

create policy perfis_ler on perfis for select to authenticated using (user_id = auth.uid() or eh_staff());
create policy perfis_admin on perfis for all to authenticated using (eh_admin()) with check (eh_admin());

create policy resp_ler on area_responsaveis for select to authenticated using (user_id = auth.uid() or eh_staff());
create policy resp_admin on area_responsaveis for all to authenticated using (eh_admin()) with check (eh_admin());

-- Responsáveis e operação enxergam os eventos (sem dados pessoais); staff edita
create policy eventos_ler on eventos for select to authenticated using (meu_papel() is not null);
create policy eventos_staff_upd on eventos for update to authenticated using (eh_staff()) with check (eh_staff());

create policy setores_ler on evento_setores for select to authenticated using (meu_papel() is not null);
create policy cotas_ler on cotas for select to authenticated using (meu_papel() is not null);
create policy cotas_hist_ler on cotas_historico for select to authenticated using (eh_staff());

-- Dados pessoais completos: só Admin/Marketing. Responsáveis leem pela função lista_area (CPF mascarado).
create policy pessoas_staff on pessoas for select to authenticated using (eh_staff());

create policy pedidos_ler on pedidos for select to authenticated using (responde_area(area_id));
create policy convites_ler on convites for select to authenticated using (responde_area(area_id));
create policy ingressos_ler on ingressos for select to authenticated using (responde_area(area_id));
create policy validacoes_ler on validacoes for select to authenticated using (responde_area(area_id));
create policy historico_ler on status_historico for select to authenticated
  using (exists (select 1 from ingressos i where i.id = ingresso_id and responde_area(i.area_id)));

create policy auditoria_admin on auditoria for select to authenticated using (eh_admin());

create policy config_ler on config for select to authenticated using (true);
create policy config_admin on config for all to authenticated using (eh_admin()) with check (eh_admin());
create policy transicoes_ler on transicoes for select to authenticated using (true);
create policy transicoes_admin on transicoes for all to authenticated using (eh_admin()) with check (eh_admin());

-- ---------------------------------------------------------------- execução de funções
-- Funções internas e as usadas pelas páginas públicas/cron só rodam com service role.
-- (as próprias funções checam o perfil; usuário autenticado sem perfil ativo não passa)
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
do $$
declare f text;
begin
  foreach f in array array[
    '_ctx(text,text)', '_exigir(boolean,text)', '_travar_setor(uuid,setor)', '_cabe(uuid,setor,uuid,integer)',
    '_upsert_pessoa(jsonb,boolean)', '_checar_duplicado(uuid,uuid,uuid)',
    '_mudar_status(uuid,status_ingresso,text,text)', '_promover_lista_espera(uuid,setor,uuid)',
    '_encerrar_convite(uuid,status_convite,text,text)', '_em_lote(uuid[],status_ingresso,text,status_ingresso[])',
    'expirar_convites()', 'consultar_link(text)', 'preencher_convite(text,jsonb,boolean)', 'acao_torcedor(text,text)'
  ] loop
    execute format('revoke execute on function %s from authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------- transições de status
insert into transicoes (de, para, papeis, torcedor, sistema) values
  ('convite_enviado', 'aguardando_preenchimento', '{}', true, true),
  ('convite_enviado', 'solicitado', '{}', true, false),
  ('aguardando_preenchimento', 'solicitado', '{}', true, false),
  ('convite_enviado', 'convite_expirado', '{}', false, true),
  ('aguardando_preenchimento', 'convite_expirado', '{}', false, true),
  ('convite_enviado', 'cancelado', '{admin,marketing,responsavel}', true, true),
  ('aguardando_preenchimento', 'cancelado', '{admin,marketing,responsavel}', true, true),
  ('lista_espera', 'solicitado', '{admin,marketing}', false, true),
  ('solicitado', 'validado_area', '{admin,marketing,responsavel}', false, false),
  ('validado_area', 'aprovado', '{admin,marketing}', false, false),
  ('solicitado', 'recusado', '{admin,marketing}', false, false),
  ('validado_area', 'recusado', '{admin,marketing}', false, false),
  ('lista_espera', 'recusado', '{admin,marketing}', false, false),
  ('aprovado', 'facial_pendente', '{admin,marketing,responsavel}', false, true),
  ('aprovado', 'facial_ok', '{admin,marketing}', true, false),
  ('facial_pendente', 'facial_ok', '{admin,marketing}', true, false),
  ('facial_ok', 'enviado', '{admin,marketing}', false, false),
  ('aprovado', 'enviado', '{admin,marketing}', false, false),
  ('facial_pendente', 'enviado', '{admin,marketing}', false, false),
  ('enviado', 'confirmado', '{admin,marketing}', true, false),
  ('enviado', 'presente', '{admin,marketing,operacao}', false, false),
  ('confirmado', 'presente', '{admin,marketing,operacao}', false, false),
  ('presente', 'confirmado', '{admin,marketing,operacao}', false, false),
  ('enviado', 'no_show', '{admin,marketing}', false, true),
  ('confirmado', 'no_show', '{admin,marketing}', false, true),
  ('solicitado', 'cancelado', '{admin,marketing,responsavel}', true, true),
  ('validado_area', 'cancelado', '{admin,marketing,responsavel}', true, true),
  ('aprovado', 'cancelado', '{admin,marketing,responsavel}', true, true),
  ('facial_pendente', 'cancelado', '{admin,marketing,responsavel}', true, true),
  ('facial_ok', 'cancelado', '{admin,marketing,responsavel}', true, true),
  ('lista_espera', 'cancelado', '{admin,marketing,responsavel}', true, true),
  ('enviado', 'cancelado', '{admin,marketing}', true, false),
  ('confirmado', 'cancelado', '{admin,marketing}', true, false);

-- ---------------------------------------------------------------- áreas e cotas do regulamento
insert into areas (nome, slug, ordem) values
  ('DH', 'dh', 10),
  ('Marketing', 'marketing', 20),
  ('Comercial Corporativo', 'comercial-corporativo', 30),
  ('Comercial Regional BH', 'comercial-regional-bh', 40),
  ('Comercial', 'comercial', 45),
  ('DI', 'di', 50),
  ('Produção', 'producao', 60),
  ('Luggo', 'luggo', 70),
  ('Urba', 'urba', 80),
  ('Relacionamento Institucional – Diretoria Executiva', 'rel-institucional', 90),
  ('Presidência', 'presidencia', 100);

insert into config (chave, valor) values
('cotas_padrao', $json${
  "jogo": {
    "camarote": {"capacidade": 44, "cota_por_area": false, "areas": {}},
    "arquibancada": {"capacidade": 100, "cota_por_area": true, "areas": {
      "dh": 10, "marketing": 10, "comercial-corporativo": 10, "comercial-regional-bh": 10, "di": 10,
      "producao": 10, "luggo": 6, "urba": 6, "rel-institucional": 10, "presidencia": 18
    }}
  },
  "show": {
    "camarote": {"capacidade": 44, "cota_por_area": false, "areas": {}},
    "pista": {"capacidade": 50, "cota_por_area": true, "areas": {
      "dh": 6, "marketing": 6, "comercial": 6, "di": 6, "producao": 6, "luggo": 2, "urba": 2,
      "rel-institucional": {"quantidade": 8, "sob_demanda": true}, "presidencia": 8
    }}
  }
}$json$::jsonb),
('privacidade', to_jsonb('A MRV coleta seu nome, CPF, celular e e-mail exclusivamente para emitir e enviar seu ingresso da Arena MRV, orientar o cadastro no Galo ID e controlar o acesso no dia do evento. Os dados são compartilhados com o Clube Atlético Mineiro/Arena MRV apenas para emissão do ingresso, ficam acessíveis só à equipe responsável e são anonimizados após o período de retenção. Você pode pedir acesso, correção ou exclusão pelo e-mail do Marketing MRV.'::text)),
('retencao_meses', '12'::jsonb),
('galo_id_url', '"https://galoid.com.br/"'::jsonb);
