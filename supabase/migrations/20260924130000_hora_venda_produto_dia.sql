-- Horário do item cancelado (pedido do usuário, 24/09/2026): a aba VENDAS_TIPOS do robô manda
-- DATA_VENDA_BALCAO com data E hora da transação, diferente de VENDAS_PRODUTOS (só data, já
-- pré-agregada pelo bot). Guarda só o horário aqui (a data já vive em `data_venda`) — nullable e
-- sem default: linhas 'F' (vendas normais) continuam sem hora, nenhuma mudança de comportamento
-- pra elas.
alter table public.vendas_produto_dia
  add column if not exists hora_venda text;
