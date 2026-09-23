-- Permite ao administrador corrigir data, valor e conta dos lançamentos manuais do Fluxo.
drop policy if exists "fluxo_lancamentos_update" on public.fluxo_lancamentos;
create policy "fluxo_lancamentos_update" on public.fluxo_lancamentos
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
