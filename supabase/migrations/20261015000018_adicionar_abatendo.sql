-- Admin adicionando convidado numa área sem saldo: o ingresso precisa sair de algum lugar.
-- Move só o que falta da cota de outra área (ou do saldo livre do setor) para a área escolhida
-- e cria o pedido, tudo na mesma transação. Fica no histórico de cotas.
-- p_doador: área de onde sai a cota; null = saldo livre do setor (ainda não distribuído).
create or replace function adicionar_abatendo(p_evento uuid, p_setor setor, p_area uuid, p_doador uuid,
                                              p_pessoas jsonb, p_opcoes jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_n int := jsonb_array_length(coalesce(p_pessoas, '[]'::jsonb));
  v_falta int;
  v_disp int;
  v_nome_doador text;
  v_motivo text;
begin
  perform _exigir(eh_staff());
  perform _exigir(p_doador is distinct from p_area, 'VALOR_INVALIDO: escolha outra área para abater');
  perform _exigir((select cota_por_area from evento_setores where evento_id = p_evento and setor = p_setor),
                  'VALOR_INVALIDO: este setor não tem cota por área');
  perform _travar_setor(p_evento, p_setor);

  v_falta := greatest(0, v_n - (select s.saldo from saldo(p_evento, p_setor, p_area) s));
  if v_falta > 0 then
    if p_doador is null then
      v_disp := (select capacidade from evento_setores where evento_id = p_evento and setor = p_setor)
              - coalesce((select sum(quantidade) from cotas where evento_id = p_evento and setor = p_setor), 0);
      v_nome_doador := 'saldo livre do setor';
    else
      v_disp := (select s.saldo from saldo(p_evento, p_setor, p_doador) s);
      v_nome_doador := (select nome from areas where id = p_doador);
    end if;
    if coalesce(v_disp, 0) < v_falta then
      raise exception 'COTA_EXCEDIDA: % tem saldo de % e são necessários %', v_nome_doador, coalesce(v_disp, 0), v_falta;
    end if;

    v_motivo := format('Admin adicionou convidado: %s ingresso(s) de %s para %s', v_falta, v_nome_doador, (select nome from areas where id = p_area));
    perform _ctx('usuario', v_motivo);
    if p_doador is not null then
      update cotas set quantidade = quantidade - v_falta where evento_id = p_evento and setor = p_setor and area_id = p_doador;
    end if;
    insert into cotas (evento_id, setor, area_id, quantidade) values (p_evento, p_setor, p_area, v_falta)
    on conflict (evento_id, setor, area_id) do update set quantidade = cotas.quantidade + v_falta;
  end if;

  return criar_pedido(p_evento, p_setor, p_area, p_pessoas,
                      coalesce(p_opcoes, '{}') || jsonb_build_object('lista_espera', false, 'ignorar_cota', false));
end $$;
revoke execute on function adicionar_abatendo(uuid, setor, uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function adicionar_abatendo(uuid, setor, uuid, uuid, jsonb, jsonb) to authenticated, service_role;
