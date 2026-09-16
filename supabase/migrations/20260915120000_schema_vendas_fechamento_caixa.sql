-- Schema da integração de vendas via `bot_padaria_v3` (ver `integracoes-scripts/` na raiz do
-- projeto e `app/PRALIS-INTELIGENTE DESIGNER/bot.rar`) — substitui o schema anterior
-- (20260915090000_schema_vendas_integracao.sql e seguintes, removidos): aquele modelo era
-- baseado numa integração venda-a-venda que nunca chegou a ser usada de verdade. Este é o
-- contrato REAL de um bot já em produção há meses, que lê o CREARE e resume por
-- dia/PDV/operador (não venda a venda) — mesmo formato que ele já grava na planilha Google Sheets
-- da empresa, só que também mandado pra cá via `POST /vendas/importar`.
--
-- Idempotência: cada linha vem com um HASH (sha256, calculado pelo bot a partir dos campos que
-- não devem mudar o resultado — ver `services/hashService.js`/`services/recordService.js` do
-- bot). `hash` é a chave de conflito do upsert: reenviar a mesma linha nunca duplica.

create table public.vendas_fechamento_caixa_dia (
  id uuid primary key default gen_random_uuid(),
  hash text not null unique,

  empresa text not null,
  data_venda date not null,
  pdv text not null,
  operador text not null,
  primeira_venda timestamptz,
  ultima_venda timestamptz,
  numero_vendas integer not null default 0,

  -- as seis formas "de sempre" (mesma ordem da planilha do bot)
  crediario numeric(14, 2) not null default 0,
  credito numeric(14, 2) not null default 0,
  debito numeric(14, 2) not null default 0,
  dinheiro numeric(14, 2) not null default 0,
  pix numeric(14, 2) not null default 0,
  voucher numeric(14, 2) not null default 0,
  outros numeric(14, 2) not null default 0, -- forma de pagamento fora das 6 conhecidas
  total_pagamento numeric(14, 2) not null default 0,

  -- as seis novas (21/08/2026 no bot) — ver comentário na query original sobre CREDIARIO vs CLIENTES
  clientes numeric(14, 2) not null default 0,
  colaboradores numeric(14, 2) not null default 0,
  alimentacao numeric(14, 2) not null default 0,
  roubo_furto numeric(14, 2) not null default 0,
  socios numeric(14, 2) not null default 0,
  sobra_perda numeric(14, 2) not null default 0,

  chave text, -- EMPRESA|DATA|PDV|OPERADOR, do próprio bot — só auditoria, não é chave aqui (hash é)
  caixa text, -- extraído do OPERADOR pelo bot (ex.: "VND CAIXA PDV - 1M" -> "1")
  turno text, -- idem (-> "M"/"T")
  colaborador text, -- de-para operador -> colaborador, quando o bot resolve

  atualizado_em_origem timestamptz, -- quando o bot processou esta linha (ATUALIZADO_EM)
  criado_em timestamptz not null default now()
);

create index vendas_fechamento_caixa_dia_data_idx on public.vendas_fechamento_caixa_dia (data_venda);
create index vendas_fechamento_caixa_dia_empresa_data_idx on public.vendas_fechamento_caixa_dia (empresa, data_venda);

-- Vendas por produto/dia (opcional — o bot manda quando VENDAS_PRODUTOS está habilitado; nosso
-- app não usa isso hoje, mas aceitar e guardar é mais simples e seguro do que rejeitar tipo válido).
create table public.vendas_produto_dia (
  id uuid primary key default gen_random_uuid(),
  hash text not null unique,

  empresa text not null,
  data_venda date not null,
  produto_codigo text,
  produto text not null,
  quantidade numeric(14, 3) not null default 0,
  valor_unitario numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,

  atualizado_em_origem timestamptz,
  criado_em timestamptz not null default now()
);

create index vendas_produto_dia_data_idx on public.vendas_produto_dia (data_venda);
