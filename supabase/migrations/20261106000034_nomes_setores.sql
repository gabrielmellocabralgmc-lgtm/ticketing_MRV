-- Nome do setor personalizável por evento (ex.: show com "Cadeira Inferior" no lugar de "Pista").
-- Os setores internos continuam camarote / arquibancada / pista; aqui fica só o nome exibido.
alter table eventos add column nomes_setores jsonb not null default '{}'::jsonb
  check (jsonb_typeof(nomes_setores) = 'object');
