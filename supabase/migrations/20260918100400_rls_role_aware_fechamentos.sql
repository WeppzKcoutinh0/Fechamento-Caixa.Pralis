-- Substitui os 8 policies "authenticated: tudo" (`using(true) with check(true)`, criados em
-- 20260914090100_rls.sql) por regras role-aware, pedido do usuário (18/09/2026):
--   - admin: acesso total, sempre.
--   - caixa: só o PRÓPRIO fechamento (criado_por = auth.uid()) — e só pode EDITAR/EXCLUIR
--     enquanto a sessão de caixa dele ainda estiver ABERTA (ou não tiver sessão nenhuma, caso
--     um admin tenha criado direto). Uma vez que a sessão fecha, o fechamento fica congelado
--     pra quem não é admin.
--
-- Validado linha a linha contra o corpo de `salvar_fechamento` (security invoker, delete+reinsert
-- de cada filho na MESMA transação): o DELETE num fechamento novo não casa nada (não é bloqueado
-- por RLS, é só um no-op); o INSERT dos filhos já vê o pai recém-inserido na mesma transação
-- (regra de visibilidade própria do Postgres). Nenhum salvamento legítimo quebra; uma tentativa
-- de reeditar uma sessão já FECHADA falha inteira e atômica (a RPC toda é uma transação), sem
-- estado parcial.
--
-- `/fechamentos/:id/ver` e as telas de Consulta por Período (Entradas/Transferências/Saídas) não
-- precisam de NENHUMA mudança de código — já usam o cliente `authenticated` normal, então ficam
-- automaticamente escopadas por papel só com esta troca de policy.

drop policy "fechamentos_authenticated_all" on public.fechamentos;

create policy "fechamentos_select" on public.fechamentos
  for select
  to authenticated
  using (public.is_admin() or criado_por = auth.uid());

create policy "fechamentos_insert" on public.fechamentos
  for insert
  to authenticated
  with check (public.is_admin() or criado_por = auth.uid());

create policy "fechamentos_update" on public.fechamentos
  for update
  to authenticated
  using (
    public.is_admin()
    or (
      criado_por = auth.uid()
      and (
        cash_session_id is null
        or exists (
          select 1 from public.cash_sessions cs
          where cs.id = fechamentos.cash_session_id and cs.status = 'ABERTO'
        )
      )
    )
  );

create policy "fechamentos_delete" on public.fechamentos
  for delete
  to authenticated
  using (
    public.is_admin()
    or (
      criado_por = auth.uid()
      and (
        cash_session_id is null
        or exists (
          select 1 from public.cash_sessions cs
          where cs.id = fechamentos.cash_session_id and cs.status = 'ABERTO'
        )
      )
    )
  );

-- Mesma lógica pros 7 filhos, só que via `exists` contra o pai (eles não têm `criado_por`
-- próprio, só `fechamento_id`). Uma função auxiliar evita repetir a subquery 4x por tabela.
create or replace function public.fechamento_editavel(p_fechamento_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select public.is_admin() or exists (
    select 1 from public.fechamentos f
    where f.id = p_fechamento_id
      and f.criado_por = auth.uid()
      and (
        f.cash_session_id is null
        or exists (
          select 1 from public.cash_sessions cs
          where cs.id = f.cash_session_id and cs.status = 'ABERTO'
        )
      )
  );
$$;

create or replace function public.fechamento_visivel(p_fechamento_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select public.is_admin() or exists (
    select 1 from public.fechamentos f
    where f.id = p_fechamento_id and f.criado_por = auth.uid()
  );
$$;

grant execute on function public.fechamento_editavel(uuid) to authenticated;
grant execute on function public.fechamento_visivel(uuid) to authenticated;

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'entradas', 'sangrias', 'transferencias_caixa', 'lancamentos',
    'discriminacoes', 'crediario_itens', 'pdv_entradas'
  ]
  loop
    execute format('drop policy %I on public.%I', tabela || '_authenticated_all', tabela);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.fechamento_visivel(fechamento_id))',
      tabela || '_select', tabela
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.fechamento_editavel(fechamento_id))',
      tabela || '_insert', tabela
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.fechamento_editavel(fechamento_id))',
      tabela || '_update', tabela
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.fechamento_editavel(fechamento_id))',
      tabela || '_delete', tabela
    );
  end loop;
end $$;
