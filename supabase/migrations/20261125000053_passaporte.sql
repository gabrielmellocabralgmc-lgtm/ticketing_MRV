-- Estrangeiro: aceitar PASSAPORTE no lugar do CPF.
-- Regra (igual à da tela, src/lib/cpf.ts): se o documento tiver alguma letra, é passaporte —
-- guardado só com letras e números, em maiúsculas, de 5 a 20 caracteres. Fica no mesmo campo
-- pessoas.cpf, então duplicidade, histórico e listas continuam funcionando do mesmo jeito.

-- A coluna era char(11) só com números: vira text. A view depende dela, então sai e volta igual.
drop view v_ingressos;

alter table pessoas drop constraint if exists pessoas_cpf_check;
alter table pessoas alter column cpf type text using btrim(cpf);
alter table pessoas add constraint pessoas_cpf_check
  check (cpf ~ '^\d{11}$' or (cpf ~ '^[A-Z0-9]{5,20}$' and cpf ~ '[A-Z]'));

alter table walkins alter column cpf type text using btrim(cpf);

create view v_ingressos with (security_invoker = true) as
select i.*, p.nome, p.cpf, p.celular, p.email, a.nome as area_nome, a.ordem as area_ordem,
       coalesce(pt.nome, anfitriao_externo_de(i.convidado_de, i.anfitriao_texto, pe.anfitriao_externo)) as convidado_de_nome,
       pe.indicacao_de, pe.origem, pe.prioridade, pe.catering, pe.centro_custo,
       pe.observacao as pedido_observacao, pe.manual_admin,
       anfitriao_externo_de(i.convidado_de, i.anfitriao_texto, pe.anfitriao_externo) as anfitriao_externo
from ingressos i
join areas a on a.id = i.area_id
join pedidos pe on pe.id = i.pedido_id
left join pessoas p on p.id = i.pessoa_id
left join ingressos t on t.id = i.convidado_de
left join pessoas pt on pt.id = t.pessoa_id;
grant select on v_ingressos to authenticated, service_role;

-- ---------------------------------------------------------------- funções de CPF
create or replace function eh_passaporte(c text) returns boolean
language sql immutable as $$ select coalesce(c, '') ~ '[A-Za-z]' $$;

create or replace function normalizar_cpf(c text) returns text
language sql immutable as $$
  select case
    when eh_passaporte(c) then
      case when length(upper(regexp_replace(c, '[^A-Za-z0-9]', '', 'g'))) between 5 and 20
           then upper(regexp_replace(c, '[^A-Za-z0-9]', '', 'g')) end
    when length(regexp_replace(coalesce(c, ''), '\D', '', 'g')) between 1 and 11
      then lpad(regexp_replace(c, '\D', '', 'g'), 11, '0')
  end
$$;

create or replace function cpf_valido(c text) returns boolean
language plpgsql immutable as $$
declare
  bruto text := regexp_replace(coalesce(c, ''), '\D', '', 'g');
  d text;
  s int;
  dv int;
begin
  if eh_passaporte(c) then return normalizar_cpf(c) is not null; end if;
  if length(bruto) = 0 or length(bruto) > 11 then return false; end if;
  d := lpad(bruto, 11, '0');
  if d ~ '^(\d)\1{10}$' then return false; end if;
  for n in 9..10 loop
    s := 0;
    for i in 1..n loop
      s := s + substr(d, i, 1)::int * (n + 2 - i);
    end loop;
    dv := (s * 10) % 11 % 10;
    if dv <> substr(d, n + 1, 1)::int then return false; end if;
  end loop;
  return true;
end $$;

create or replace function mascarar_cpf(c text) returns text
language sql immutable as $$
  select case
    when c is null then null
    when eh_passaporte(c) then 'Pass. ' || left(c, 2) || '***' || right(c, 2)
    else '***.' || substr(c, 4, 3) || '.' || substr(c, 7, 3) || '-**'
  end
$$;
