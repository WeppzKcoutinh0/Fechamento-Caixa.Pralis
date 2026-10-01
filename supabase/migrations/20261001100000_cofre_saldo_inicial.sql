-- "Saldo inicial" por cofre central (pedido do usuário, 01/10/2026): depois do fix do saldo do
-- Cofre Troco (que passou a descontar certo os suprimentos entregues aos caixas, ver
-- pages/cofres.vue), o histórico completo de fechamentos antigos virou uma dívida retroativa
-- grande e negativa — o usuário pediu pra "zerar" esse histórico e começar a contar só a partir de
-- agora, com um saldo de abertura escolhido por ele (positivo, não a conta retroativa). Isto NÃO
-- apaga nada do histórico real (fechamentos/entradas continuam intactos) — só define um ponto de
-- corte: o saldo do cofre passa a ser `saldo_cents + movimentações com data >= data_corte`,
-- ignorando tudo anterior ao corte no cálculo (mas sem deletar a Movimentação nem o fechamento
-- original). Mesmo padrão de RLS de `cofre_notas` (20260923110000): só admin lida com cofres
-- centrais.
create table public.cofre_saldo_inicial (
  cofre text primary key check (cofre in ('Caixa Principal', 'Caixa de Troco', 'Fluxo')),
  saldo_cents integer not null default 0,
  data_corte date not null,
  atualizado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now()
);

alter table public.cofre_saldo_inicial enable row level security;

create policy "cofre_saldo_inicial_select" on public.cofre_saldo_inicial
  for select to authenticated using (public.is_admin());
create policy "cofre_saldo_inicial_upsert" on public.cofre_saldo_inicial
  for insert to authenticated with check (public.is_admin());
create policy "cofre_saldo_inicial_update" on public.cofre_saldo_inicial
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
