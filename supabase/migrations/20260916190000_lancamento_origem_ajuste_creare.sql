-- Pedido do usuário (16/09/2026): os ajustes que o CREARE já manda (Colaboradores/Alimentação-
-- Lanches/Furto-Roubo/Sócios/Sobra-Perda, ver colunas já existentes em
-- vendas_fechamento_caixa_dia) deixam de ser só um aviso informativo — o app agora cria/atualiza
-- automaticamente uma Despesa por categoria (ver aplicarAjustesComoLancamentos em
-- utils/vendasFechamento.ts). Esta coluna marca QUAL categoria gerou o lançamento (uma das chaves
-- de ResumoVendasDia.ajustes: 'colaboradores'/'alimentacao'/'rouboFurto'/'socios'/'sobraPerda'),
-- '' pra lançamento manual (todo lançamento de antes desta migration continua '') — é só assim que
-- uma nova busca acha e ATUALIZA o mesmo lançamento em vez de duplicar.
alter table public.lancamentos
  add column origem_ajuste_creare text not null default '';
