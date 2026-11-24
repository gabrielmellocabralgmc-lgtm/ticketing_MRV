-- Adicionar campo visivel para permitir jogos ocultos (apenas admin consegue add)
alter table eventos add column visivel boolean not null default true;

-- Atualizar queries para filtrar por visivel quando não for admin
-- Isso será feito nas views/funções de leitura
