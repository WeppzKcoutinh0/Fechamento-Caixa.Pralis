-- Função de escrita atômica do fechamento (registro principal + todos os itens filhos).
--
-- O app atual envia o objeto inteiro de uma vez em `salvarFechamento()` (um único write no
-- localStorage) — aqui isso vira uma única transação Postgres: upsert do registro principal e
-- substituição completa dos itens filhos (apaga e reinsere as listas), espelhando exatamente a
-- semântica "reenvia o estado atual inteiro" que o formulário já tem hoje, sem inventar
-- atualização incremental que não existia.
--
-- `security invoker`: roda com os privilégios de quem chama (respeita a RLS normalmente,
-- não é um caminho para burlar permissão).

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

  insert into public.fechamentos select v_row.*
  on conflict (id) do update set
    codigo = excluded.codigo,
    data = excluded.data,
    caixa = excluded.caixa,
    turno = excluded.turno,
    responsavel = excluded.responsavel,
    total_entrada = excluded.total_entrada,
    total_saida = excluded.total_saida,
    relatorio_pdv = excluded.relatorio_pdv,
    nr_clientes = excluded.nr_clientes,
    ticket_medio = excluded.ticket_medio,
    pdv_dinheiro = excluded.pdv_dinheiro,
    pdv_credito = excluded.pdv_credito,
    pdv_debito = excluded.pdv_debito,
    pdv_pix = excluded.pdv_pix,
    pdv_voucher = excluded.pdv_voucher,
    pdv_crediario = excluded.pdv_crediario,
    total_pdv = excluded.total_pdv,
    img_pdv_path = excluded.img_pdv_path,
    nr_maquininha = excluded.nr_maquininha,
    manha_inicial = excluded.manha_inicial,
    tarde_final = excluded.tarde_final,
    credito_manha = excluded.credito_manha,
    debito_manha = excluded.debito_manha,
    pix_manha = excluded.pix_manha,
    voucher_manha = excluded.voucher_manha,
    img_manha_path = excluded.img_manha_path,
    credito_tarde = excluded.credito_tarde,
    debito_tarde = excluded.debito_tarde,
    pix_tarde = excluded.pix_tarde,
    voucher_tarde = excluded.voucher_tarde,
    img_tarde_path = excluded.img_tarde_path,
    liq_credito = excluded.liq_credito,
    liq_debito = excluded.liq_debito,
    liq_pix = excluded.liq_pix,
    liq_voucher = excluded.liq_voucher,
    total_cred_clientes = excluded.total_cred_clientes,
    total_cred_colab = excluded.total_cred_colab,
    total_crediario = excluded.total_crediario,
    rel_despesas = excluded.rel_despesas,
    rel_mercadoria = excluded.rel_mercadoria,
    rel_retiradas = excluded.rel_retiradas,
    rel_cartoes = excluded.rel_cartoes,
    valor_total_final = excluded.valor_total_final,
    diferenca = excluded.diferenca,
    rel_pdv_diferenca = excluded.rel_pdv_diferenca,
    dinheiro_contado = excluded.dinheiro_contado,
    saldo_fisico_esperado = excluded.saldo_fisico_esperado,
    atualizado_em = now();

  delete from public.entradas where fechamento_id = v_id;
  delete from public.sangrias where fechamento_id = v_id;
  delete from public.lancamentos where fechamento_id = v_id;
  delete from public.discriminacoes where fechamento_id = v_id;
  delete from public.crediario_itens where fechamento_id = v_id;

  if jsonb_array_length(coalesce(payload->'entradas', '[]'::jsonb)) > 0 then
    insert into public.entradas (fechamento_id, ordem, lacre, valor, descricao)
    select v_id, ord - 1, x->>'lacre', (x->>'valor')::numeric, x->>'descricao'
    from jsonb_array_elements(payload->'entradas') with ordinality as t(x, ord);
  end if;

  if jsonb_array_length(coalesce(payload->'sangrias', '[]'::jsonb)) > 0 then
    insert into public.sangrias (fechamento_id, ordem, descricao, lacre, valor)
    select v_id, ord - 1, x->>'descricao', x->>'lacre', (x->>'valor')::numeric
    from jsonb_array_elements(payload->'sangrias') with ordinality as t(x, ord);
  end if;

  if jsonb_array_length(coalesce(payload->'lancamentos', '[]'::jsonb)) > 0 then
    insert into public.lancamentos (
      fechamento_id, ordem, tipo, status, data_ref, data_nfe, n_nfe, fornecedor, tipo_mer,
      valor, obs_tipo, obs_texto, obs_audio_path, foto_path, vencimento, foto_nota_path
    )
    select
      v_id, ord - 1, x->>'tipo', coalesce(x->>'status', 'naopago'),
      nullif(x->>'dataRef','')::date, nullif(x->>'dataNfe','')::date, x->>'nNfe', x->>'fornecedor',
      nullif(x->>'tipoMer',''), (x->>'valor')::numeric, nullif(x->>'obsTipo',''), x->>'obsTexto',
      x->>'obsAudioPath', x->>'fotoPath', nullif(x->>'vencimento','')::date, x->>'fotoNotaPath'
    from jsonb_array_elements(payload->'lancamentos') with ordinality as t(x, ord);
  end if;

  if jsonb_array_length(coalesce(payload->'discriminacoes', '[]'::jsonb)) > 0 then
    insert into public.discriminacoes (
      fechamento_id, ordem, tipo, qtd, produto, grupo, val_unit, desconto_val, desconto_pct, total
    )
    select
      v_id, ord - 1, x->>'tipo', (x->>'qtd')::numeric, x->>'produto', nullif(x->>'grupo',''),
      (x->>'valUnit')::numeric, (x->>'descontoVal')::numeric, (x->>'descontoPct')::numeric, (x->>'total')::numeric
    from jsonb_array_elements(payload->'discriminacoes') with ordinality as t(x, ord);
  end if;

  if jsonb_array_length(coalesce(payload->'crediario', '[]'::jsonb)) > 0 then
    insert into public.crediario_itens (fechamento_id, ordem, tipo, nome, valor, foto_path)
    select v_id, ord - 1, x->>'tipo', x->>'nome', (x->>'valor')::numeric, x->>'fotoPath'
    from jsonb_array_elements(payload->'crediario') with ordinality as t(x, ord);
  end if;

  return v_id;
end;
$$;

grant execute on function public.salvar_fechamento(jsonb) to authenticated;
