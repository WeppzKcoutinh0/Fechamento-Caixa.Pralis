-- Detalhes de pagamento dos produtos vendidos.
alter table public.vendas_produto_dia
  add column if not exists forma_pagamento text;

create index if not exists vendas_produto_dia_forma_pagamento_idx
  on public.vendas_produto_dia (forma_pagamento);
