-- "Dinheiro contado na gaveta" ganha decomposição em notas/moedas + lacre de fechamento (pedido
-- do usuário, 23/09/2026) — mesmo espírito de valor_notas/valor_moedas em transferencias_tesouraria
-- (20260923090000), mas aqui o Valor Total É calculado automaticamente (notas + moedas), decisão
-- explícita do usuário pra este campo específico (diferente do formulário do admin).
alter table public.fechamentos
  add column if not exists dinheiro_contado_notas numeric(14,2),
  add column if not exists dinheiro_contado_moedas numeric(14,2),
  add column if not exists lacre_fechamento text not null default '';

-- Reaplica a última versão da RPC, acrescentando as 2 colunas novas no update (aceitas por
-- `jsonb_populate_record` no insert automaticamente, sem precisar de coalesce — mesmo tratamento
-- já dado a dinheiro_contado/saldo_fisico_esperado, colunas nullable de "card aditivo").
create or replace function public.salvar_fechamento(payload jsonb)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid;
  v_row public.fechamentos;
begin
  v_row := jsonb_populate_record(null::public.fechamentos, payload->'fechamento');
  v_id := coalesce(v_row.id, gen_random_uuid());
  v_row.id := v_id;
  v_row.criado_por := coalesce(v_row.criado_por, auth.uid());
  v_row.criado_em := coalesce(v_row.criado_em, now());
  v_row.atualizado_em := now();
  v_row.cash_session_id := coalesce(
    v_row.cash_session_id,
    (select f.cash_session_id from public.fechamentos f where f.id = v_id)
  );

  if v_row.cash_session_id is not null and not public.is_admin() then
    if not exists (
      select 1 from public.cash_sessions cs
      where cs.id = v_row.cash_session_id
        and cs.opened_by = auth.uid()
    ) then
      raise exception 'cash_session_id não pertence ao usuário autenticado'
        using errcode = '42501';
    end if;
  end if;

  v_row.responsavel := coalesce(v_row.responsavel, '');
  v_row.total_entrada := coalesce(v_row.total_entrada, 0);
  v_row.total_saida := coalesce(v_row.total_saida, 0);
  v_row.relatorio_pdv := coalesce(v_row.relatorio_pdv, '');
  v_row.ticket_medio := coalesce(v_row.ticket_medio, 0);
  v_row.total_pdv := coalesce(v_row.total_pdv, 0);
  v_row.nr_maquininha := coalesce(v_row.nr_maquininha, '');
  v_row.nr_maquininha_tarde := coalesce(v_row.nr_maquininha_tarde, '');
  v_row.manha_inicial := coalesce(v_row.manha_inicial, 0);
  v_row.tarde_final := coalesce(v_row.tarde_final, 0);
  v_row.credito_manha := coalesce(v_row.credito_manha, 0);
  v_row.debito_manha := coalesce(v_row.debito_manha, 0);
  v_row.pix_manha := coalesce(v_row.pix_manha, 0);
  v_row.voucher_manha := coalesce(v_row.voucher_manha, 0);
  v_row.credito_tarde := coalesce(v_row.credito_tarde, 0);
  v_row.debito_tarde := coalesce(v_row.debito_tarde, 0);
  v_row.pix_tarde := coalesce(v_row.pix_tarde, 0);
  v_row.voucher_tarde := coalesce(v_row.voucher_tarde, 0);
  v_row.liq_credito := coalesce(v_row.liq_credito, 0);
  v_row.liq_debito := coalesce(v_row.liq_debito, 0);
  v_row.liq_pix := coalesce(v_row.liq_pix, 0);
  v_row.liq_voucher := coalesce(v_row.liq_voucher, 0);
  v_row.total_cred_clientes := coalesce(v_row.total_cred_clientes, 0);
  v_row.total_cred_colab := coalesce(v_row.total_cred_colab, 0);
  v_row.total_crediario := coalesce(v_row.total_crediario, 0);
  v_row.rel_despesas := coalesce(v_row.rel_despesas, 0);
  v_row.rel_mercadoria := coalesce(v_row.rel_mercadoria, 0);
  v_row.rel_retiradas := coalesce(v_row.rel_retiradas, 0);
  v_row.rel_cartoes := coalesce(v_row.rel_cartoes, 0);
  v_row.valor_total_final := coalesce(v_row.valor_total_final, 0);
  v_row.diferenca := coalesce(v_row.diferenca, 0);
  v_row.rel_pdv_diferenca := coalesce(v_row.rel_pdv_diferenca, 0);
  v_row.lacre_fechamento := coalesce(v_row.lacre_fechamento, '');

  insert into public.fechamentos select v_row.*
  on conflict (id) do update set
    codigo = excluded.codigo, data = excluded.data, caixa = excluded.caixa, turno = excluded.turno,
    responsavel = excluded.responsavel, total_entrada = excluded.total_entrada,
    total_saida = excluded.total_saida, relatorio_pdv = excluded.relatorio_pdv,
    ticket_medio = excluded.ticket_medio, total_pdv = excluded.total_pdv,
    img_pdv_path = excluded.img_pdv_path, nr_maquininha = excluded.nr_maquininha,
    nr_maquininha_tarde = excluded.nr_maquininha_tarde, manha_inicial = excluded.manha_inicial,
    tarde_final = excluded.tarde_final, credito_manha = excluded.credito_manha,
    debito_manha = excluded.debito_manha, pix_manha = excluded.pix_manha,
    voucher_manha = excluded.voucher_manha, img_manha_path = excluded.img_manha_path,
    credito_tarde = excluded.credito_tarde, debito_tarde = excluded.debito_tarde,
    pix_tarde = excluded.pix_tarde, voucher_tarde = excluded.voucher_tarde,
    img_tarde_path = excluded.img_tarde_path, liq_credito = excluded.liq_credito,
    liq_debito = excluded.liq_debito, liq_pix = excluded.liq_pix,
    liq_voucher = excluded.liq_voucher, total_cred_clientes = excluded.total_cred_clientes,
    total_cred_colab = excluded.total_cred_colab, total_crediario = excluded.total_crediario,
    rel_despesas = excluded.rel_despesas, rel_mercadoria = excluded.rel_mercadoria,
    rel_retiradas = excluded.rel_retiradas, rel_cartoes = excluded.rel_cartoes,
    valor_total_final = excluded.valor_total_final, diferenca = excluded.diferenca,
    rel_pdv_diferenca = excluded.rel_pdv_diferenca, dinheiro_contado = excluded.dinheiro_contado,
    dinheiro_contado_notas = excluded.dinheiro_contado_notas,
    dinheiro_contado_moedas = excluded.dinheiro_contado_moedas,
    lacre_fechamento = excluded.lacre_fechamento,
    saldo_fisico_esperado = excluded.saldo_fisico_esperado,
    cash_session_id = excluded.cash_session_id, atualizado_em = excluded.atualizado_em;

  delete from public.entradas where fechamento_id = v_id;
  delete from public.sangrias where fechamento_id = v_id;
  delete from public.transferencias_caixa where fechamento_id = v_id;
  delete from public.lancamentos where fechamento_id = v_id;
  delete from public.discriminacoes where fechamento_id = v_id;
  delete from public.crediario_itens where fechamento_id = v_id;
  delete from public.pdv_entradas where fechamento_id = v_id;

  if jsonb_array_length(coalesce(payload->'entradas', '[]'::jsonb)) > 0 then
    insert into public.entradas (fechamento_id, ordem, lacre, valor, descricao, tipo_conta)
    select v_id, ord - 1, coalesce(x->>'lacre', ''), coalesce((x->>'valor')::numeric, 0),
      coalesce(x->>'descricao', ''), nullif(x->>'tipoConta', '')
    from jsonb_array_elements(payload->'entradas') with ordinality as t(x, ord);
  end if;

  if jsonb_array_length(coalesce(payload->'sangrias', '[]'::jsonb)) > 0 then
    insert into public.sangrias (fechamento_id, ordem, descricao, lacre, valor)
    select v_id, ord - 1, coalesce(x->>'descricao', ''), coalesce(x->>'lacre', ''),
      coalesce((x->>'valor')::numeric, 0)
    from jsonb_array_elements(payload->'sangrias') with ordinality as t(x, ord);
  end if;

  if jsonb_array_length(coalesce(payload->'transferenciasCaixa', '[]'::jsonb)) > 0 then
    insert into public.transferencias_caixa
      (fechamento_id, ordem, caixa_origem, caixa_destino, valor, lacre, data, observacao)
    select v_id, ord - 1, nullif(x->>'caixaOrigem', ''), nullif(x->>'caixaDestino', ''),
      coalesce((x->>'valor')::numeric, 0), coalesce(x->>'lacre', ''), nullif(x->>'data', '')::date,
      coalesce(x->>'observacao', '')
    from jsonb_array_elements(payload->'transferenciasCaixa') with ordinality as t(x, ord);
  end if;

  if jsonb_array_length(coalesce(payload->'lancamentos', '[]'::jsonb)) > 0 then
    insert into public.lancamentos (
      id, fechamento_id, ordem, tipo, status, data_ref, data_nfe, n_nfe, fornecedor, tipo_mer,
      valor, valor_acrescimo, tipo_credor, obs_tipo, obs_texto, obs_audio_path, foto_path,
      vencimento, data_pagamento, foto_nota_path, origem_ajuste_creare
    )
    select coalesce(nullif(x->>'id', '')::uuid, gen_random_uuid()), v_id, ord - 1, x->>'tipo',
      coalesce(x->>'status', 'naopago'), nullif(x->>'dataRef', '')::date,
      nullif(x->>'dataNfe', '')::date, coalesce(x->>'nNfe', ''), coalesce(x->>'fornecedor', ''),
      nullif(x->>'tipoMer', ''), coalesce((x->>'valor')::numeric, 0),
      coalesce((x->>'valorAcrescimo')::numeric, 0), coalesce(nullif(x->>'tipoCredor', ''), 'fornecedor'),
      nullif(x->>'obsTipo', ''), coalesce(x->>'obsTexto', ''), x->>'obsAudioPath', x->>'fotoPath',
      nullif(x->>'vencimento', '')::date, nullif(x->>'dataPagamento', '')::date,
      x->>'fotoNotaPath', coalesce(x->>'origemAjusteCreare', '')
    from jsonb_array_elements(payload->'lancamentos') with ordinality as t(x, ord);
  end if;

  if jsonb_array_length(coalesce(payload->'discriminacoes', '[]'::jsonb)) > 0 then
    insert into public.discriminacoes
      (fechamento_id, ordem, lancamento_id, tipo, qtd, produto, grupo, val_unit, desconto_val, desconto_pct, total)
    select v_id, ord - 1, nullif(x->>'lancamentoId', '')::uuid, x->>'tipo',
      coalesce((x->>'qtd')::numeric, 0), coalesce(x->>'produto', ''), nullif(x->>'grupo', ''),
      coalesce((x->>'valUnit')::numeric, 0), coalesce((x->>'descontoVal')::numeric, 0),
      coalesce((x->>'descontoPct')::numeric, 0), coalesce((x->>'total')::numeric, 0)
    from jsonb_array_elements(payload->'discriminacoes') with ordinality as t(x, ord);
  end if;

  if jsonb_array_length(coalesce(payload->'crediario', '[]'::jsonb)) > 0 then
    insert into public.crediario_itens (fechamento_id, ordem, tipo, nome, valor, foto_path)
    select v_id, ord - 1, x->>'tipo', coalesce(x->>'nome', ''), coalesce((x->>'valor')::numeric, 0),
      x->>'fotoPath'
    from jsonb_array_elements(payload->'crediario') with ordinality as t(x, ord);
  end if;

  if jsonb_array_length(coalesce(payload->'pdvEntradas', '[]'::jsonb)) > 0 then
    insert into public.pdv_entradas
      (fechamento_id, ordem, nr_clientes, dinheiro, credito, debito, pix, voucher, crediario)
    select v_id, ord - 1, coalesce((x->>'nrClientes')::integer, 0),
      coalesce((x->>'dinheiro')::numeric, 0), coalesce((x->>'credito')::numeric, 0),
      coalesce((x->>'debito')::numeric, 0), coalesce((x->>'pix')::numeric, 0),
      coalesce((x->>'voucher')::numeric, 0), coalesce((x->>'crediario')::numeric, 0)
    from jsonb_array_elements(payload->'pdvEntradas') with ordinality as t(x, ord);
  end if;

  return v_id;
end;
$$;

grant execute on function public.salvar_fechamento(jsonb) to authenticated;

-- 2) `criar_retorno_automatico_tesouraria` ganha notas/moedas/lacre opcionais (default null) —
-- sem eles, mantém exatamente o comportamento anterior (lacre auto-gerado
-- `RETORNO-<fechamento_id>`, notas/moedas zerados). Assinatura muda de tamanho (4 -> 7
-- parâmetros), então é uma função NOVA pro Postgres — remove a antiga explicitamente pra não
-- deixar duas versões coexistindo (o client sempre chama com os 7 argumentos agora).
drop function if exists public.criar_retorno_automatico_tesouraria(uuid, text, text, numeric);

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
    'Cofre',
    true,
    'Retorno automático do fechamento ' || v_fechamento.codigo,
    auth.uid()
  )
  on conflict (lacre) do nothing;
end;
$$;

revoke all on function public.criar_retorno_automatico_tesouraria(uuid, text, text, numeric, numeric, numeric, text) from public;
grant execute on function public.criar_retorno_automatico_tesouraria(uuid, text, text, numeric, numeric, numeric, text) to authenticated;
