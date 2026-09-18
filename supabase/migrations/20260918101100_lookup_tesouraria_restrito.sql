-- O caixa precisa descobrir o valor de um lacre digitado no fechamento, mas não
-- precisa conseguir listar a tesouraria inteira (valores, lacres e observações).
-- O lookup continua disponível por uma função estreita, executada com privilégio
-- do dono, e a leitura direta da tabela fica exclusiva do admin.
create or replace function public.buscar_transferencia_tesouraria_por_lacre(p_lacre text)
returns setof public.transferencias_tesouraria
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select t.*
  from public.transferencias_tesouraria t
  where t.lacre = trim(p_lacre)
  limit 1;
$$;

revoke all on function public.buscar_transferencia_tesouraria_por_lacre(text) from public;
grant execute on function public.buscar_transferencia_tesouraria_por_lacre(text) to authenticated;

drop policy if exists "transferencias_tesouraria_select" on public.transferencias_tesouraria;
create policy "transferencias_tesouraria_select" on public.transferencias_tesouraria
  for select
  to authenticated
  using (public.is_admin());
