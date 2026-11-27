-- O responsável da área cancela um ingresso até o prazo de solicitação, MESMO que já tenha sido
-- enviado (antes só até o envio). O lugar volta para o saldo da área (ou para a lista de espera)
-- e a área pode pedir de novo. O prazo continua valendo: cancelar_ingressos barra o não-staff
-- depois de _dentro_do_prazo. A equipe de ingressos é avisada por e-mail para cancelar também
-- no sistema do Atlético (feito pelo app, em cancelarIngresso da lista da área).
update transicoes set papeis = array_append(papeis, 'responsavel')
where de in ('enviado', 'confirmado') and para = 'cancelado' and not ('responsavel' = any (papeis));
