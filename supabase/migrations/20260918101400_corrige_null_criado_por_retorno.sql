-- Reaplica `criar_retorno_automatico_tesouraria` com `is distinct from` em vez de `<>`
-- (20260918101300 foi editada depois de já aplicada: `<>` com NULL avalia pra NULL, não TRUE, e o
-- `if` nunca dispara — um fechamento com `criado_por` nulo, que existe em linhas antigas de antes
-- desta coluna existir, passaria a checagem de dono sem erro nenhum. `is distinct from` trata
-- NULL corretamente).
create or replace function public.criar_retorno_automatico_tesouraria(
  p_fechamento_id uuid,
  p_caixa text,
  p_codigo text,
  p_valor numeric
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
    valor, lacre, data_lanc, caixa_origem, caixa_destino, tempo_confirmacao, observacao, criado_por
  ) values (
    v_fechamento.dinheiro_contado,
    'RETORNO-' || p_fechamento_id::text,
    v_fechamento.data,
    v_fechamento.caixa,
    'Cofre',
    true,
    'Retorno automático do fechamento ' || v_fechamento.codigo,
    auth.uid()
  )
  on conflict (lacre) do nothing;
end;
$$;

revoke all on function public.criar_retorno_automatico_tesouraria(uuid, text, text, numeric) from public;
grant execute on function public.criar_retorno_automatico_tesouraria(uuid, text, text, numeric) to authenticated;
