-- Filtro de vendas por horário (pedido do usuário, 16/09/2026): o bot passou a agrupar por hora
-- cheia da venda (0-23), não só por turno inteiro (ver FECHAMENTO_CAIXA.sql v6 e
-- creareRepository.js#montarLinhaFechamentoCaixa) — permite "vendas do Caixa 1 entre tal e tal
-- horário" no app. `hora` fica nula pra linhas antigas/importadas da planilha do bot original
-- (que não tem esse detalhe — representam o turno inteiro, não uma hora específica).

alter table public.vendas_fechamento_caixa_dia
  add column hora smallint check (hora is null or (hora >= 0 and hora <= 23));

create index vendas_fechamento_caixa_dia_hora_idx
  on public.vendas_fechamento_caixa_dia (data_venda, caixa, turno, hora);
