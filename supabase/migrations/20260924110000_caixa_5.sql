-- Caixa 5 (pedido do usuário, 24/09/2026) — operado pelo gerente no turno da manhã, caixa normal
-- no turno da tarde. Recria as 7 CHECK CONSTRAINTs que fechavam o conjunto em 'Caixa 1'..'Caixa 4',
-- incluindo 'Caixa 5'. Definições conferidas ao vivo no banco antes desta migration (pg_constraint)
-- — cada uma recriada IDÊNTICA à atual, só com o valor novo acrescentado.

alter table public.cash_sessions drop constraint if exists cash_sessions_caixa_check;
alter table public.cash_sessions add constraint cash_sessions_caixa_check
  check (caixa = any (array['Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4', 'Caixa 5']));

alter table public.fechamentos drop constraint if exists fechamentos_caixa_check;
alter table public.fechamentos add constraint fechamentos_caixa_check
  check (caixa is null or caixa = any (array['', 'Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4', 'Caixa 5']));

alter table public.profiles drop constraint if exists profiles_caixa_padrao_check;
alter table public.profiles add constraint profiles_caixa_padrao_check
  check (caixa_padrao = any (array['Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4', 'Caixa 5']));

alter table public.transferencias_caixa drop constraint if exists transferencias_caixa_caixa_destino_check;
alter table public.transferencias_caixa add constraint transferencias_caixa_caixa_destino_check
  check (caixa_destino = any (array['Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4', 'Caixa 5']));

alter table public.transferencias_caixa drop constraint if exists transferencias_caixa_caixa_origem_check;
alter table public.transferencias_caixa add constraint transferencias_caixa_caixa_origem_check
  check (caixa_origem = any (array['Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4', 'Caixa 5']));

alter table public.transferencias_tesouraria drop constraint if exists transferencias_tesouraria_caixa_destino_check;
alter table public.transferencias_tesouraria add constraint transferencias_tesouraria_caixa_destino_check
  check (caixa_destino = any (array['Cofre', 'Caixa Principal', 'Caixa de Troco', 'Fluxo', 'Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4', 'Caixa 5']));

alter table public.transferencias_tesouraria drop constraint if exists transferencias_tesouraria_caixa_origem_check;
alter table public.transferencias_tesouraria add constraint transferencias_tesouraria_caixa_origem_check
  check (caixa_origem = any (array['Cofre', 'Caixa Principal', 'Caixa de Troco', 'Fluxo', 'Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4', 'Caixa 5']));
