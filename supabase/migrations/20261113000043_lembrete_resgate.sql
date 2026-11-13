-- Lembrete (manual, pelo botão em Ingressos digitais) para quem recebeu o link de resgate único e ainda não resgatou.
-- O texto é editável em Configurações › E-mails.
insert into modelos_email (chave, nome, descricao, assunto, corpo) values
('lembrete_resgate', 'Lembrete para resgatar o ingresso',
 'Enviado pelo botão "Lembrar quem não resgatou" em Ingressos digitais (eventos com link de resgate de uso único). Vai só para quem já recebeu o ingresso e ainda não resgatou. O botão leva à página pessoal do convidado.',
 'Lembrete: resgate o seu ingresso para {{evento}}',
 'Olá, {{nome}}!

O seu ingresso para {{evento}} ainda não foi resgatado.

📅 {{quando}}
📍 Arena MRV · {{setor}}
🚪 Portões: {{portoes}}

Para garantir o seu lugar, faça o resgate o quanto antes:

1. No celular que você vai levar ao evento, baixe o app EVENTIM BRASIL e entre com a SUA conta (nome, CPF e e-mail seus).
2. Nesse celular, toque no botão abaixo. Ele abre a sua página pessoal com o passo a passo.
3. Toque em “Resgatar meu ingresso” e aceite o ingresso no app da Eventim.

⚠️ O link é único: só funciona UMA VEZ e deve ser resgatado por você, que vai ao evento.

Bom evento!')
on conflict (chave) do nothing;
