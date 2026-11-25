-- Status "reservado" no tipo status_ingresso, de forma segura e idempotente.
--
-- Produção (Neon) ficou pela metade depois de tentativas manuais em 15/11/2026:
--   · status_ingresso_old = o tipo ORIGINAL, ainda usado por todas as colunas e funções;
--   · status_ingresso     = um tipo novo (com 'reservado') que nenhuma coluna usa.
-- Aqui o tipo novo (sem uso) é removido, o original recebe 'reservado' e volta ao nome certo.
-- Renomear mantém o mesmo tipo interno: colunas, view e funções continuam apontando para ele.
--
-- Banco novo (testes, demo): só existe status_ingresso; basta acrescentar o valor.
--
-- O valor novo só pode ser USADO depois que esta migração terminar (regra do Postgres para enum):
-- funções e regras que mencionam 'reservado' ficam na migração 049.
do $$
begin
  if to_regtype('public.status_ingresso_old') is not null then
    drop type public.status_ingresso; -- sem CASCADE: se algo ainda usasse o tipo novo, a migração para aqui
    alter type public.status_ingresso_old add value if not exists 'reservado' before 'convite_enviado';
    alter type public.status_ingresso_old rename to status_ingresso;
  else
    alter type public.status_ingresso add value if not exists 'reservado' before 'convite_enviado';
  end if;
end $$;
