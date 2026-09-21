-- Reabre `vendas_produto_dia` pra qualquer `authenticated` (era admin-only desde
-- 20260918100900) — pedido do usuário (21/09/2026): o Relatório Final do wizard passa a mostrar
-- os produtos vendidos no dia do fechamento, pra QUALQUER conta CAIXA que esteja fechando o
-- próprio caixa, não só admin. Continua sem coluna de caixa/turno (é venda por produto, loja
-- inteira, não dá pra escopar por operador) — mesma característica documentada em
-- 20260918100900, só que agora com um uso legítimo real.
drop policy if exists "vendas_produto_dia_select" on public.vendas_produto_dia;
create policy "vendas_produto_dia_select" on public.vendas_produto_dia
  for select
  to authenticated
  using (true);
