-- Fluxo oficial CREARE -> robô -> API -> Caixa/Relatórios (pedido do usuário, 25/09/2026).
-- Substitui, para "vendas canceladas", a granularidade "produto agregado por dia"
-- (vendas_produto_dia) por granularidade "uma linha por venda", com itens e pagamentos como
-- filhas — permite idempotência real por ID externo do CREARE (upsert por `id_creare`, não por
-- hash de conteúdo) e atualização de status quando uma venda finalizada é cancelada depois.
-- `vendas_produto_dia` continua existindo e alimentando "produtos vendidos no dia" (agregado,
-- não precisa de granularidade por venda) — não foi tocada.
create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  -- Formato "CREARE:<ID_VENDA_BALCAO>" (pedido do usuário) — nunca inventado: se a origem não
  -- trouxer o ID, a linha é rejeitada na importação (ver vendas_importacao_inconsistencias).
  id_creare text not null unique,
  empresa text not null,
  data_venda date not null,
  -- Hora como texto "HH:MM:SS" (mesmo padrão já usado em vendas_produto_dia.hora_venda) —
  -- evita reinterpretação de fuso horário ao converter string do MySQL em Date do Node.
  hora_venda text,
  pdv text,
  operador text,
  status text not null check (status in ('FINALIZADA', 'CANCELADA')),
  valor_total numeric not null default 0,
  atualizado_em_origem timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index vendas_empresa_data_idx on public.vendas (empresa, data_venda);
create index vendas_status_idx on public.vendas (status);

create trigger vendas_set_atualizado_em
  before update on public.vendas
  for each row
  execute function public.set_atualizado_em();

alter table public.vendas enable row level security;
create policy "vendas_select" on public.vendas for select to authenticated using (true);

create table public.vendas_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  produto_codigo text,
  produto text not null,
  quantidade numeric not null default 0,
  valor_unitario numeric not null default 0,
  total numeric not null default 0,
  -- Item cancelado dentro de uma venda parcialmente cancelada (regra 5 do usuário) — quando o
  -- CREARE não distingue por item, o robô replica o status da venda inteira aqui.
  cancelado boolean not null default false
);

create index vendas_itens_venda_id_idx on public.vendas_itens (venda_id);

alter table public.vendas_itens enable row level security;
create policy "vendas_itens_select" on public.vendas_itens for select to authenticated using (true);

create table public.vendas_pagamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references public.vendas(id) on delete cascade,
  forma_pagamento text not null,
  valor numeric not null default 0
);

create index vendas_pagamentos_venda_id_idx on public.vendas_pagamentos (venda_id);

alter table public.vendas_pagamentos enable row level security;
create policy "vendas_pagamentos_select" on public.vendas_pagamentos for select to authenticated using (true);

-- Regra 11 do usuário: venda sem ID do CREARE não pode ser inventada — fica registrada aqui pra
-- correção manual/no robô, em vez de descartada em silêncio ou gravada com um ID falso.
create table public.vendas_importacao_inconsistencias (
  id uuid primary key default gen_random_uuid(),
  motivo text not null,
  payload jsonb not null,
  criado_em timestamptz not null default now()
);

alter table public.vendas_importacao_inconsistencias enable row level security;
create policy "vendas_importacao_inconsistencias_select"
  on public.vendas_importacao_inconsistencias
  for select
  to authenticated
  using (public.is_admin());
