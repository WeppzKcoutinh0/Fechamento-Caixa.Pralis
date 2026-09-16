-- Extensão do lançamento (inspirada no Sistema Inteligente Pralís, mesma linguagem visual/campos
-- do modal de Despesa/Mercadoria/Retirada de lá) — aditiva, três colunas novas, todas com default
-- seguro: lançamento existente antes desta migration continua se comportando exatamente igual
-- (juros = 0, tipo_credor = 'fornecedor', data_pagamento = null).

alter table public.lancamentos
  add column valor_acrescimo numeric(14, 2) not null default 0,
  add column tipo_credor text not null default 'fornecedor'
    check (tipo_credor in ('fornecedor', 'colaborador')),
  add column data_pagamento date;
