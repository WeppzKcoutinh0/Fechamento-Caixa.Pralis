-- Preserva o ID da venda original do CREARE nos itens cancelados.
-- A coluna é nullable porque os agregados antigos/finalizados não possuem esse detalhe.
alter table public.vendas_produto_dia
  add column if not exists venda_creare_id text;

create index if not exists vendas_produto_dia_venda_creare_id_idx
  on public.vendas_produto_dia (venda_creare_id);
