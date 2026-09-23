-- 3 cofres novos (pedido do usuário, 23/09/2026): Caixa Principal, Caixa de Troco e Fluxo — três
-- conceitos NOVOS, independentes do "Cofre" genérico que já existia (decisão explícita do
-- usuário: não são a mesma coisa, "Cofre" continua existindo como está). Ciclo descrito pelo
-- usuário: CAIXA PRINCIPAL → CAIXA DE TROCO → CAIXAS/FLUXO → CONFERÊNCIA → (parte fica no Fluxo,
-- parte volta pro Principal) → o ciclo recomeça.

-- 1) Os 2 CHECK constraints de caixa_origem/caixa_destino em transferencias_tesouraria ganham os
-- 3 valores novos (nomes de constraint são os padrão do Postgres pra CHECK de coluna sem nome
-- explícito: <tabela>_<coluna>_check).
alter table public.transferencias_tesouraria
  drop constraint if exists transferencias_tesouraria_caixa_origem_check,
  drop constraint if exists transferencias_tesouraria_caixa_destino_check,
  add constraint transferencias_tesouraria_caixa_origem_check
    check (caixa_origem in ('Cofre', 'Caixa Principal', 'Caixa de Troco', 'Fluxo', 'Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4')),
  add constraint transferencias_tesouraria_caixa_destino_check
    check (caixa_destino in ('Cofre', 'Caixa Principal', 'Caixa de Troco', 'Fluxo', 'Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4'));

-- 2) Retorno automático do fechamento (criado quando o operador salva o fechamento com "Dinheiro
-- contado" > 0) passa a entrar no Fluxo, não direto no Principal (pedido do usuário, 23/09/2026 —
-- bate com a descrição do ciclo: o dinheiro do fechamento entra no Fluxo primeiro; mover do Fluxo
-- pro Principal vira uma ação manual do admin depois, feita em /cofres ou /transferencias).
create or replace function public.criar_retorno_automatico_tesouraria(
  p_fechamento_id uuid,
  p_caixa text,
  p_codigo text,
  p_valor numeric,
  p_valor_notas numeric default null,
  p_valor_moedas numeric default null,
  p_lacre text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_fechamento public.fechamentos%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sessão obrigatória.';
  end if;

  select f.*
    into v_fechamento
    from public.fechamentos f
   where f.id = p_fechamento_id;

  if not found then
    raise exception using errcode = '22023', message = 'Fechamento não encontrado.';
  end if;

  if not public.is_admin() and v_fechamento.criado_por is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Fechamento não pertence ao usuário.';
  end if;

  if p_caixa is distinct from v_fechamento.caixa
     or p_codigo is distinct from v_fechamento.codigo
     or p_valor is distinct from v_fechamento.dinheiro_contado
     or p_valor <= 0 then
    raise exception using errcode = '22023', message = 'Dados do retorno não correspondem ao fechamento.';
  end if;

  insert into public.transferencias_tesouraria (
    valor, valor_notas, valor_moedas, lacre, data_lanc, caixa_origem, caixa_destino,
    tempo_confirmacao, observacao, criado_por
  ) values (
    v_fechamento.dinheiro_contado,
    coalesce(p_valor_notas, 0),
    coalesce(p_valor_moedas, 0),
    coalesce(nullif(trim(p_lacre), ''), 'RETORNO-' || p_fechamento_id::text),
    v_fechamento.data,
    v_fechamento.caixa,
    'Fluxo',
    true,
    'Retorno automático do fechamento ' || v_fechamento.codigo,
    auth.uid()
  )
  on conflict (lacre) do nothing;
end;
$$;

grant execute on function public.criar_retorno_automatico_tesouraria(uuid, text, text, numeric, numeric, numeric, text) to authenticated;

-- 3) Anotações livres por cofre (pedido do usuário: "clica e expande e anota") — observação sem
-- efeito financeiro, só registro pro admin ("contei e bate", "faltou X"), nunca vira transação.
create table public.cofre_notas (
  id uuid primary key default gen_random_uuid(),
  cofre text not null check (cofre in ('Caixa Principal', 'Caixa de Troco', 'Fluxo')),
  texto text not null,
  criado_por uuid not null default auth.uid() references auth.users(id),
  criado_em timestamptz not null default now()
);

create index cofre_notas_cofre_idx on public.cofre_notas (cofre, criado_em desc);

alter table public.cofre_notas enable row level security;

-- Só admin lida com cofres centrais — mesmo padrão de transferencias_tesouraria (20260918101100).
create policy "cofre_notas_select" on public.cofre_notas
  for select to authenticated using (public.is_admin());
create policy "cofre_notas_insert" on public.cofre_notas
  for insert to authenticated with check (public.is_admin());
create policy "cofre_notas_delete" on public.cofre_notas
  for delete to authenticated using (public.is_admin());
