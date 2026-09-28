-- Recria o lookup usado pelo caixa para preencher o valor de uma transferência
-- cadastrada na Tesouraria a partir do número do lacre.
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

revoke all on function public.buscar_transferencia_tesouraria_por_lacre(text) from public, anon, authenticated;
grant execute on function public.buscar_transferencia_tesouraria_por_lacre(text) to authenticated;
