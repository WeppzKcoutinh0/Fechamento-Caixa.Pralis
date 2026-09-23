-- Retornos automáticos antigos foram criados antes da separação entre Cofre e Fluxo
-- e ficaram com caixa_destino = 'Cofre'. O dinheiro devolvido pelos caixas deve sempre
-- entrar no Fluxo.
update public.transferencias_tesouraria
   set caixa_destino = 'Fluxo',
       transferencia_retorno = true,
       atualizado_em = now()
 where caixa_destino = 'Cofre'
   and caixa_origem in ('Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4')
   and (
     transferencia_retorno
     or
     lacre ilike 'RETORNO-%'
     or observacao ilike 'Retorno automático%'
   );
