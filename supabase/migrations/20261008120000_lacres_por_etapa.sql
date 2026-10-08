-- A Tesouraria cadastra os selos físicos de cada etapa do turno.
-- `lacre`/`lacre_inicial` continuam compatíveis com os registros antigos.
alter table public.transferencias_tesouraria
  add column if not exists lacre_inicial text not null default '',
  add column if not exists lacre_sangrias text not null default '',
  add column if not exists lacre_final text not null default '';

update public.transferencias_tesouraria
set lacre_inicial = lacre
where nullif(trim(lacre_inicial), '') is null
   or trim(lacre_inicial) = '';

create unique index if not exists transferencias_tesouraria_lacre_inicial_idx
  on public.transferencias_tesouraria (lacre_inicial)
  where nullif(trim(lacre_inicial), '') is not null;

create or replace function public.buscar_transferencia_tesouraria_por_lacre(
  p_lacre text,
  p_data date,
  p_consumir boolean default false
)
returns setof public.transferencias_tesouraria
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if p_consumir then
    return query
      update public.transferencias_tesouraria t
      set lacre_usado_em = now(), lacre_usado_por = auth.uid()
      where coalesce(nullif(trim(t.lacre_inicial), ''), t.lacre) = trim(p_lacre)
        and t.data_lanc = p_data
        and t.lacre_usado_em is null
      returning t.*;
  else
    return query
      select t.*
      from public.transferencias_tesouraria t
      where coalesce(nullif(trim(t.lacre_inicial), ''), t.lacre) = trim(p_lacre)
        and t.data_lanc = p_data
      limit 1;
  end if;
end;
$$;

revoke all on function public.buscar_transferencia_tesouraria_por_lacre(text, date, boolean) from public;
grant execute on function public.buscar_transferencia_tesouraria_por_lacre(text, date, boolean) to authenticated;

create or replace function public.validar_lacre_fechamento(
  p_lacre text,
  p_tipo text,
  p_data date,
  p_caixa text,
  p_turno text default null
)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.transferencias_tesouraria t
    where t.data_lanc = p_data
      and t.caixa_destino = p_caixa
      and (p_turno is null or t.turno_destino = p_turno)
      and case p_tipo
        when 'inicial' then coalesce(nullif(trim(t.lacre_inicial), ''), t.lacre) = trim(p_lacre)
        when 'sangrias' then nullif(trim(t.lacre_sangrias), '') = trim(p_lacre)
        when 'final' then nullif(trim(t.lacre_final), '') = trim(p_lacre)
        else false
      end
  );
$$;

revoke all on function public.validar_lacre_fechamento(text, text, date, text, text) from public, anon;
grant execute on function public.validar_lacre_fechamento(text, text, date, text, text) to authenticated;
