-- Dúvidas: a equipe de ingressos (Admin) também pode ABRIR uma conversa com uma área.
-- A mensagem vai para todos os responsáveis ativos da área (e-mail) e aparece na caixa de dúvidas
-- da lista da área; qualquer responsável responde por lá. autor_* = quem da equipe abriu.
alter table duvidas drop constraint if exists duvidas_autor_tipo_check;
alter table duvidas add constraint duvidas_autor_tipo_check check (autor_tipo in ('gestor', 'convidado', 'equipe'));
