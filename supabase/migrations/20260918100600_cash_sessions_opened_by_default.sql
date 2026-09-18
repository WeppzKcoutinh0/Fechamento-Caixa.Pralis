-- Achado testando de verdade (18/09/2026): um INSERT em cash_sessions sem enviar `opened_by`
-- explicitamente falha na RLS (`opened_by is null`, nunca é igual a `auth.uid()`) — em vez de
-- depender do cliente (app ou qualquer chamada REST direta) lembrar de mandar esse campo,
-- coloca um DEFAULT que já resolve isso sozinho, mesmo espírito de `criado_por` em
-- `salvar_fechamento` (nunca depender só da disciplina do código que chama).
alter table public.cash_sessions
  alter column opened_by set default auth.uid();
