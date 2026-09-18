-- Pedido do usuário (18/09/2026): cada caixa só vê as vendas sincronizadas do PRÓPRIO
-- caixa/turno (antes, qualquer conta autenticada lia as vendas de todos os caixas/turnos —
-- achado do `security-reviewer`, item que ficou pra decisão do usuário e foi aprovado agora).
--
-- `vendas_fechamento_caixa_dia.caixa`/`.turno` vêm no formato que o bot extrai do OPERADOR
-- ("1"/"2"/.../"M"/"T" — ver 20260915120000), diferente do formato usado em
-- `profiles.caixa_padrao`/`turno_padrao` ("Caixa 1", "Manhã") — a função abaixo faz essa
-- conversão inline, mesma regra de `caixaParaNumero`/`turnoParaLetra` (utils/vendasFechamento.ts).
create or replace function public.venda_visivel(p_caixa text, p_turno text)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select public.is_admin() or exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.caixa_padrao is not null
      and p.turno_padrao is not null
      and trim(regexp_replace(p.caixa_padrao, '^Caixa\s*', '', 'i')) = p_caixa
      and (case p.turno_padrao when 'Manhã' then 'M' when 'Tarde' then 'T' end) = p_turno
  );
$$;

grant execute on function public.venda_visivel(text, text) to authenticated;

drop policy if exists "vendas_fechamento_caixa_dia_authenticated_select" on public.vendas_fechamento_caixa_dia;
create policy "vendas_fechamento_caixa_dia_select" on public.vendas_fechamento_caixa_dia
  for select
  to authenticated
  using (public.venda_visivel(caixa, turno));

-- `vendas_produto_dia` não tem coluna de caixa/turno (é venda por produto, loja inteira) e o app
-- não lê essa tabela hoje (ver comentário na 20260915120000) — sem uso legítimo pra uma conta
-- CAIXA, então em vez de deixar `using(true)` ela também fica admin-only.
drop policy if exists "vendas_produto_dia_authenticated_select" on public.vendas_produto_dia;
create policy "vendas_produto_dia_select" on public.vendas_produto_dia
  for select
  to authenticated
  using (public.is_admin());
