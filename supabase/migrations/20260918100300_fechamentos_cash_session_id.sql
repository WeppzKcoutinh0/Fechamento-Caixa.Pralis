-- Liga um fechamento à sessão de caixa que o originou. Nullable: um fechamento criado direto
-- pelo admin (sem passar pela abertura de caixa) continua válido sem sessão nenhuma; o único
-- fechamento hoje já existente na tabela (linha de teste antiga, criado_por null) também fica
-- sem sessão, e passa a ser visível só pro admin a partir da migration de RLS role-aware.
alter table public.fechamentos
  add column cash_session_id uuid references public.cash_sessions (id);
