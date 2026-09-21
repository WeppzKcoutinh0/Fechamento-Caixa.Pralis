-- Pedido do usuário (21/09/2026): quando o Caixa 1 registra "Transferência entre caixas" com
-- destino Caixa 2, o Caixa 2 precisa ENXERGAR isso automaticamente ao abrir o próprio fechamento
-- (Transferências Automáticas / Relatório Final) — sem precisar que ninguém avise por fora.
--
-- `transferencias_caixa` (ver `20260915140000_transferencia_caixa.sql`) é filho de `fechamentos`
-- e herda a RLS dele (`criado_por = auth.uid() or is_admin()`) — o Caixa 2 não consegue ler as
-- linhas que o Caixa 1 gravou. Em vez de afrouxar essa RLS (abriria a visão de TODOS os campos de
-- QUALQUER fechamento alheio), esta função devolve só o agregado estritamente necessário: soma
-- por caixa de origem, filtrada pela data e SEMPRE pelo `caixa_padrao` de quem está chamando (não
-- um parâmetro que o cliente possa manipular) — mesmo padrão de
-- `buscar_transferencia_tesouraria_por_lacre` (20260918101100).
--
-- IMPORTANTE (mesma ressalva que o comentário original de `transferencias_caixa` já fazia): isto
-- continua SEM confirmação do lado de quem recebe — se o Caixa 1 selecionar o caixa destino
-- errado, os dois lados ficam contando esse valor sem nenhum aviso. Aceito como trade-off
-- explícito do usuário em favor da simplicidade (mesma lógica de "Transferências Automáticas" já
-- implementada: soma automática ao invés de exigir passo manual extra).
create or replace function public.transferencias_caixa_recebidas(p_data date)
returns table (caixa_origem text, valor_total_cents bigint)
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select tc.caixa_origem, round(sum(tc.valor) * 100)::bigint as valor_total_cents
  from public.transferencias_caixa tc
  join public.fechamentos f on f.id = tc.fechamento_id
  join public.profiles p on p.user_id = auth.uid()
  where f.data = p_data
    and p.caixa_padrao is not null
    and tc.caixa_destino = p.caixa_padrao
    and tc.caixa_origem is distinct from p.caixa_padrao
  group by tc.caixa_origem;
$$;

revoke all on function public.transferencias_caixa_recebidas(date) from public;
grant execute on function public.transferencias_caixa_recebidas(date) to authenticated;
