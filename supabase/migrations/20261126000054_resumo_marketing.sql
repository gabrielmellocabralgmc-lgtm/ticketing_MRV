-- Resumo do jogo por e-mail ao time de Marketing (perfil "marketing"): uma atualização 36h antes
-- do jogo e a atualização final 24h antes. Disparado pela rotina /api/cron/resumo-marketing
-- (a cada 30 min, junto com as demais); cada etapa sai uma vez por evento (registro em envios).
-- Os números são os mesmos do Painel do jogo. Textos editáveis em Configurações › E-mails.
insert into modelos_email (chave, nome, descricao, assunto, corpo) values
('resumo_marketing', 'Marketing · atualização 36h antes do jogo',
 'Enviado ao time de Marketing 36h antes do jogo, com os números de cada setor e as áreas que ainda não pediram.',
 'Atualização · {{jogo}} ({{quando}})',
 'Este é um e-mail automático. Não responda.

Olá, {{nome}}!

Faltam 36 horas para {{jogo}}, {{quando}}. Portões: {{portoes}}.

Como estão os ingressos agora (os mesmos números do Painel do jogo):

{{numeros}}

Áreas que ainda não pediram:
{{sem_pedido}}

Convidados com a facial pendente: {{pendente_facial}}.

Você recebe a atualização final 24 horas antes do jogo.'),
('resumo_marketing_final', 'Marketing · atualização final 24h antes do jogo',
 'Enviado ao time de Marketing 24h antes do jogo: a última atualização antes da partida.',
 'Atualização final · {{jogo}} ({{quando}})',
 'Este é um e-mail automático. Não responda.

Olá, {{nome}}!

Atualização final: faltam 24 horas para {{jogo}}, {{quando}}. Portões: {{portoes}}.

Como estão os ingressos agora (os mesmos números do Painel do jogo):

{{numeros}}

Áreas que ainda não pediram:
{{sem_pedido}}

Convidados com a facial pendente: {{pendente_facial}}.

Mudanças até o jogo aparecem sempre no Painel, pelo botão abaixo.')
on conflict (chave) do nothing;
