-- Correção de conceito do Fluxo (pedido do usuário, 23/09/2026): "Fluxo é tudo o que sobe dos
-- caixas — sangrias e o valor total ao fechar o caixa". O retorno automático do "dinheiro
-- contado" já ia pro Fluxo (20260923110000), mas as SANGRIAS de um fechamento nunca criavam
-- nenhuma movimentação automática — ficavam só dentro do fechamento, sem refletir no saldo do
-- Fluxo. Esta migration fecha essa lacuna com uma função irmã de
-- `criar_retorno_automatico_tesouraria`, mesmo padrão exato (valida contra o valor persistido no
-- fechamento, idempotente por lacre único).
create or replace function public.criar_sangria_automatica_tesouraria(
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

  -- `total_saida` é exatamente a soma das sangrias do fechamento (ver comentário em
  -- utils/financeiro.ts: "totalSaidaCents já É a sangria").
  if p_caixa is distinct from v_fechamento.caixa
     or p_codigo is distinct from v_fechamento.codigo
     or p_valor is distinct from v_fechamento.total_saida
     or p_valor <= 0 then
    raise exception using errcode = '22023', message = 'Dados da sangria não correspondem ao fechamento.';
  end if;

  insert into public.transferencias_tesouraria (
    valor, lacre, data_lanc, caixa_origem, caixa_destino, tempo_confirmacao, observacao, criado_por
  ) values (
    v_fechamento.total_saida,
    'SANGRIA-' || p_fechamento_id::text,
    v_fechamento.data,
    v_fechamento.caixa,
    'Fluxo',
    true,
    'Sangrias do fechamento ' || v_fechamento.codigo,
    auth.uid()
  )
  on conflict (lacre) do nothing;
end;
$$;

revoke all on function public.criar_sangria_automatica_tesouraria(uuid, text, text, numeric) from public;
grant execute on function public.criar_sangria_automatica_tesouraria(uuid, text, text, numeric) to authenticated;
