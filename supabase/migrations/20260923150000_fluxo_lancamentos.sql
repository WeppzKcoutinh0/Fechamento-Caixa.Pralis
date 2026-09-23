-- Lançamentos manuais do Fluxo. O saldo do Fluxo não deve ser derivado de
-- transferências de saída (por exemplo, Fluxo -> Caixa Principal).
create table public.fluxo_lancamentos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  valor numeric(14, 2) not null check (valor > 0),
  conta text not null check (conta in ('Conta Cofre', 'Conta Principal')),
  criado_por uuid not null default auth.uid() references auth.users (id),
  criado_em timestamptz not null default now()
);

create index fluxo_lancamentos_data_idx on public.fluxo_lancamentos (data desc, criado_em desc);

alter table public.fluxo_lancamentos enable row level security;

create policy "fluxo_lancamentos_select" on public.fluxo_lancamentos
  for select to authenticated using (public.is_admin());
create policy "fluxo_lancamentos_insert" on public.fluxo_lancamentos
  for insert to authenticated with check (public.is_admin());
create policy "fluxo_lancamentos_delete" on public.fluxo_lancamentos
  for delete to authenticated using (public.is_admin());
create policy "fluxo_lancamentos_update" on public.fluxo_lancamentos
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
