-- E-mails dos shows (e demais eventos que não são jogo): quando existe um modelo "<chave>_show",
-- ele é usado no lugar do modelo do jogo. Variáveis novas:
--   {{evento}}        nome do evento (igual a {{jogo}})
--   {{como_receber}}  passo a passo de como o convidado recebe o ingresso (PDF/link por e-mail, etc.)
--   {{requisito_email}} " e o e-mail (é por ele que o ingresso chega)" nos eventos com ingresso digital

insert into modelos_email (chave, nome, descricao, assunto, corpo) values
('convocacao_area_show', 'Convocação da área (show)',
 'Versão para shows da convocação das áreas. Enviada pelo Admin/Marketing a cada responsável quando o evento abre.',
 'Ingressos MRV · {{evento}} · {{area}}: solicite até {{prazo_curto}}',
 'Este é um e-mail automático. Não responda: todo o processo (pedido, validação e envio) é feito pelo sistema de ingressos MRV, pelo link abaixo.

Olá, {{responsavel}}! Tudo bem?

A MRV tem ingressos para {{evento}} na Arena MRV, para convidar clientes, parceiros e colaboradores.

:: SOBRE O EVENTO

{{evento}} – {{quando}} | Arena MRV
Abertura dos portões: {{portoes}}

:: SOLICITAÇÃO DE INGRESSOS

A cota de {{area}} é de {{cota}} ingressos ({{setor}}).

Cadastre os convidados no sistema, com nome, CPF e celular de cada um{{requisito_email}}:
{{link}}

Você escolhe como preencher:
• Modo preenchimento pelo gestor: você digita os dados e eles já ficam validados. Dá para trocar nomes até o fim do prazo.
• Modo preenchimento pelo próprio convidado: você gera um link, o convidado preenche e você valida a lista no sistema, no mesmo prazo.

📌 Prazo para cadastrar e validar os convidados: até {{prazo_curto}}.
➡️ Sem a lista validada no prazo, não conseguimos liberar os ingressos.

:: COMO O CONVIDADO RECEBE O INGRESSO

{{como_receber}}

:: INFORMAÇÕES ADICIONAIS

1 CPF = 1 ingresso. O ingresso é pessoal e intransferível.
Se o convidado não puder ir, ele mesmo cancela pela página pessoal (o link chega com o ingresso) e o lugar volta para a sua área.'),

('lembrete_area_show', 'Lembrete para a área (show)',
 'Versão para shows do lembrete automático às áreas perto do prazo.',
 'Lembrete: ingressos de {{evento}} — prazo {{prazo_curto}}',
 'Este é um e-mail automático. Não responda.

Olá, {{responsavel}}!

A {{area}} ainda tem {{saldo}} de {{cota}} ingressos disponíveis para {{evento}} ({{quando}}) e {{pendentes}} convidado(s) aguardando validação.

📌 O prazo termina {{prazo_curto}}. Depois disso, a lista fica travada e o saldo não usado volta para o Marketing MRV.

Acesse a lista da sua área pelo botão abaixo.'),

('convite_convidado_show', 'Convite para o convidado (show)',
 'Versão para shows do convite enviado quando a área gera um link e informa o e-mail do convidado.',
 'Você foi convidado para {{evento}} na Arena MRV',
 'Olá, {{nome}}!

A MRV ({{area}}) reservou {{lugares}} para você em {{evento}}, {{quando}}, na {{setor}} da Arena MRV.

Para garantir, preencha seus dados (nome, CPF e celular{{requisito_email}}) até {{validade}}, pelo botão abaixo.

Depois:
1. A área que convidou você confere e valida a lista.
2. {{como_receber}}

O ingresso é pessoal e intransferível. Se não puder ir, cancele pela sua página pessoal para o lugar ir para outra pessoa.'),

('ingresso_enviado_show', 'Ingresso enviado (show)',
 'Versão para shows sem ingresso digital: enviado quando a equipe marca o ingresso como enviado.',
 'Seu ingresso para {{evento}} foi enviado',
 'Olá, {{nome}}!

Seu ingresso para {{evento}} ({{quando}}) foi enviado pela MRV.

{{como_receber}}

📍 Arena MRV · {{setor}}
🚪 Portões: {{portoes}}
Leve um documento com foto.

Quando estiver com o ingresso, confirme pelo botão abaixo. Não vai poder ir? Cancele pela mesma página para o lugar ir para outra pessoa.')
on conflict (chave) do nothing;

-- Ingresso digital: passo a passo completo (vale para qualquer evento com ingresso digital)
update modelos_email set
  assunto = 'Seu ingresso para {{evento}} está pronto',
  corpo = 'Olá, {{nome}}! 🎉

Seu ingresso para {{evento}} está pronto.

📅 {{quando}}
📍 Arena MRV · {{setor}}
🚪 Portões: {{portoes}}

:: COMO USAR O SEU INGRESSO

1. Clique no botão “Baixar meu ingresso”, logo abaixo.
   • Se o seu ingresso for um PDF, ele abre (ou baixa) direto: salve no celular ou imprima.
   • Se for um link da bilheteria, siga as instruções da página que abrir (às vezes é preciso entrar com o seu CPF ou e-mail).
2. No dia, apresente o ingresso na entrada, no celular ou impresso, com um documento com foto.

O ingresso também fica disponível na sua página pessoal: {{link}}

⚠️ O ingresso é pessoal e intransferível: não encaminhe este e-mail.
Não vai poder ir? Cancele pela sua página pessoal para o lugar ir para outra pessoa.

Bom evento!',
  atualizado_em = now()
where chave = 'ingresso_digital';
