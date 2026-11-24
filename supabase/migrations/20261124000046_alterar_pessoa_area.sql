-- Função para admin alterar pessoa de área
create or replace function alterar_pessoa_area(
  p_ingresso_id uuid,
  p_nova_area_id uuid
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_ing ingressos;
  v_area_antiga uuid;
  v_area_nova areas;
begin
  perform _exigir(eh_admin(), 'SEM_PERMISSAO: apenas Admin pode alterar pessoa de área');

  select * into v_ing from ingressos where id = p_ingresso_id;
  perform _exigir(v_ing.id is not null, 'INGRESSO_NAO_EXISTE: ingresso não encontrado');

  select * into v_area_nova from areas where id = p_nova_area_id and ativo;
  perform _exigir(v_area_nova.id is not null, 'AREA_NAO_EXISTE: área não encontrada ou inativa');

  v_area_antiga := v_ing.area_id;
  
  if v_area_antiga = p_nova_area_id then
    return 'MESMO: pessoa já está nessa área';
  end if;

  -- Atualizar área do ingresso
  update ingressos set area_id = p_nova_area_id, atualizado_em = now() where id = p_ingresso_id;

  -- Registrar auditoria
  perform registrar_auditoria('alterar_area', 'ingresso', p_ingresso_id::text, 
    jsonb_build_object('de_area', v_area_antiga, 'para_area', p_nova_area_id, 'nome_area_novo', v_area_nova.nome));

  return 'OK';
end $$;
