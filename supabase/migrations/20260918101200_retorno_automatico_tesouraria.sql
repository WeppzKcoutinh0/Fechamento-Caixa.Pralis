-- Pedido do usuário (18/09/2026): versão simplificada do "retorno pro tesoureiro" que existe no
-- Sistema Inteligente Pralís de referência — lá, ao FECHAR o caixa, se sobrar saldo positivo, o
-- sistema cria automaticamente uma transferência "Caixa -> Cofre" com esse valor, pendente até a
-- tesouraria conferir. Aqui: mesmo espírito, sem a trava/disputa/idempotência elaborada de lá —
-- ao salvar um fechamento com `dinheiro_contado > 0`, gera automaticamente uma linha em
-- `transferencias_tesouraria` (Caixa X -> Cofre, `tempo_confirmacao = true`, aguardando o botão
-- "Confirmar recebimento" que já existe em `/transferencias`).
--
-- `security definer`: quem chama isto é o CAIXA salvando o próprio fechamento — mas o `insert`
-- em `transferencias_tesouraria` é admin-only (`transferencias_tesouraria_insert`). Esta função
-- eleva o privilégio só pra este insert específico, do mesmo jeito que `is_admin()`/
-- `fechamento_editavel` já fazem neste projeto.
--
-- Idempotente por construção: `lacre = 'RETORNO-' || fechamento_id` é determinístico e a coluna
-- `lacre` já tem índice único — reenviar o mesmo fechamento (edição, re-salvamento) nunca duplica
-- o retorno, só ignora silenciosamente (`on conflict do nothing`).
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
begin
  if p_valor is null or p_valor <= 0 then
    return;
  end if;

  insert into public.transferencias_tesouraria (
    valor, lacre, data_lanc, caixa_origem, caixa_destino, tempo_confirmacao, observacao, criado_por
  ) values (
    p_valor,
    'RETORNO-' || p_fechamento_id::text,
    current_date,
    p_caixa,
    'Cofre',
    true,
    'Retorno automático do fechamento ' || p_codigo,
    auth.uid()
  )
  on conflict (lacre) do nothing;
end;
$$;

grant execute on function public.criar_retorno_automatico_tesouraria(uuid, text, text, numeric) to authenticated;
