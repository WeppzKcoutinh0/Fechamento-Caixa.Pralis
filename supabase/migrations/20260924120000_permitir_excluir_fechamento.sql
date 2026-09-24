-- Permite excluir um fechamento sem apagar a sessão histórica que o originou.
-- A sessão continua registrada, mas deixa de apontar para o fechamento removido.
alter table public.cash_sessions
  drop constraint if exists cash_sessions_fechamento_id_fkey;

alter table public.cash_sessions
  add constraint cash_sessions_fechamento_id_fkey
  foreign key (fechamento_id)
  references public.fechamentos (id)
  on delete set null;
