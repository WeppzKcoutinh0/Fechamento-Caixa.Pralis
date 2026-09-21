-- Normaliza lançamentos automáticos criados antes da separação entre Despesas e Mercadorias.
-- A origem é a marca de idempotência do bot; lançamentos manuais (origem vazia) não são tocados.
update public.lancamentos
   set tipo = 'mercadoria'
 where origem_ajuste_creare in ('rouboFurto', 'sobraPerda')
   and tipo <> 'mercadoria';

update public.lancamentos
   set tipo = 'despesa'
 where origem_ajuste_creare in ('colaboradores', 'alimentacao', 'socios')
   and tipo <> 'despesa';
