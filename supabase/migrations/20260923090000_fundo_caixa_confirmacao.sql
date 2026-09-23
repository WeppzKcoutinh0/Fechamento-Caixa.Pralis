-- Conferência de fundo de caixa na abertura (pedido do usuário, 23/09/2026).
--
-- 1) `transferencias_tesouraria` ganha "valor em notas" e "valor em moedas" — decomposição do
-- valor total, independentes entre si (decisão explícita do usuário: sem validação de que a
-- soma bate com `valor`, são 3 campos livres). `buscar_transferencia_tesouraria_por_lacre`
-- (20260918101100) já faz `select t.*`, então passa a devolver as duas colunas novas sem
-- precisar recriar a função.
alter table public.transferencias_tesouraria
  add column if not exists valor_notas numeric(14,2) not null default 0,
  add column if not exists valor_moedas numeric(14,2) not null default 0;

-- 2) `cash_sessions` ganha o estado de conferência do fundo, respondido na hora de Abrir Caixa
-- (quando o lacre digitado bate com uma transferência cadastrada na Tesouraria que tenha
-- notas/moedas). `fundo_confirmado`:
--   - null  = sem lacre encontrado, ou encontrado mas ainda não respondido (não deveria persistir
--             assim: o front bloqueia "Abrir Caixa" até escolher uma opção quando há lacre com
--             valor cadastrado — ver FormularioAbrirCaixa.vue).
--   - true  = operador confirmou que a contagem física bate com o valor cadastrado.
--   - false = operador contou diferente — vira pendência pro admin revisar em `/pendencias`.
--             `fundo_valor_notas_contado`/`fundo_valor_moedas_contado` só existem nesse caso.
-- Decisão do usuário: essa divergência é só um alerta/registro — NÃO muda nenhum cálculo do
-- fechamento (que continua usando o valor cadastrado pelo admin na Tesouraria, como já fazia).
alter table public.cash_sessions
  add column if not exists fundo_confirmado boolean,
  add column if not exists fundo_confirmado_em timestamptz,
  add column if not exists fundo_valor_notas_contado numeric(14,2),
  add column if not exists fundo_valor_moedas_contado numeric(14,2),
  add column if not exists fundo_pendencia_resolvida_em timestamptz;

-- Índice parcial pra listagem de pendências (`/pendencias`, só admin) não escanear a tabela
-- inteira — mesmo espírito do índice de `data_lanc` em transferencias_tesouraria.
create index if not exists cash_sessions_pendencia_fundo_idx
  on public.cash_sessions (opened_at)
  where fundo_confirmado = false and fundo_pendencia_resolvida_em is null;
