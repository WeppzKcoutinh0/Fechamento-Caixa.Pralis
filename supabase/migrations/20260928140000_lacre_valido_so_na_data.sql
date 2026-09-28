-- Pedido do usuário (28/09/2026): "quando o tesoureiro cria um lacre para tal data, depois
-- dessa data não tem mais como usar o lacre — era apenas na data que ele escolheu".
--
-- O "cadastro de lacres" já existe hoje (comentário original em useTransferenciasTesouraria.ts):
-- o tesoureiro cria uma transferência em /cofres ou /transferencias com um `lacre` + `data_lanc`,
-- e o CAIXA, ao digitar esse mesmo número numa Entrada (SecaoTransferencias.vue), tem o valor
-- preenchido sozinho via buscar_transferencia_tesouraria_por_lacre(). Essa função hoje não olha
-- data nem impede reuso — corrigido aqui com 2 regras:
--   1. Só casa se `data_lanc` for EXATAMENTE a data em que está sendo usado (não antes, não depois).
--   2. Uso único: ao ser usado numa Entrada, fica marcado (`lacre_usado_em`) e nunca mais casa —
--      mesmo no mesmo dia, mesmo que a Entrada seja depois excluída (decisão deliberada: um lacre
--      físico, uma vez rompido/lido, não volta a ficar "lacrado").
--
-- O lookup do "lacre de abertura" (SecaoTransferencias.vue, linha ~221 — o caixa redigita o lacre
-- que ele já informou ao abrir a sessão, só pra mostrar quanto tinha) continua sem consumir nada
-- (`p_consumir default false`) — não é o "usar o lacre" que o usuário descreveu, e consumir ali
-- quebraria o preenchimento ao recarregar a página no meio do fechamento.

alter table public.transferencias_tesouraria
  add column if not exists lacre_usado_em timestamptz,
  add column if not exists lacre_usado_por uuid references auth.users(id);

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
      where t.lacre = trim(p_lacre)
        and t.data_lanc = p_data
        and t.lacre_usado_em is null
      returning t.*;
  else
    return query
      select t.*
      from public.transferencias_tesouraria t
      where t.lacre = trim(p_lacre)
        and t.data_lanc = p_data
      limit 1;
  end if;
end;
$$;

revoke all on function public.buscar_transferencia_tesouraria_por_lacre(text, date, boolean) from public;
grant execute on function public.buscar_transferencia_tesouraria_por_lacre(text, date, boolean) to authenticated;

-- Assinatura antiga (text) fica sem uso — remove pra não deixar uma porta lateral sem a regra nova.
drop function if exists public.buscar_transferencia_tesouraria_por_lacre(text);
