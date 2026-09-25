-- Endurece as RPCs expostas pelo Data API.
-- O app sempre exige sessão autenticada antes de chegar a estas operações.
-- Funções de trigger/helpers não devem ser endpoints RPC públicos.

-- Remove a execução herdada de PUBLIC/anon/authenticated antes de conceder
-- somente o mínimo necessário para o fluxo autenticado.
revoke all on function public.set_atualizado_em() from public, anon, authenticated;
revoke all on function public.salvar_fechamento(jsonb) from public, anon, authenticated;
revoke all on function public.buscar_transferencia_tesouraria_por_lacre(text) from public, anon, authenticated;
revoke all on function public.cash_session_caixa_turno_permitido(text, text) from public, anon, authenticated;
revoke all on function public.cash_sessions_protege_imutaveis() from public, anon, authenticated;
revoke all on function public.criar_retorno_automatico_tesouraria(uuid, text, text, numeric, numeric, numeric, text) from public, anon, authenticated;
revoke all on function public.criar_sangria_automatica_tesouraria(uuid, text, text, numeric) from public, anon, authenticated;
revoke all on function public.fechamento_editavel(uuid) from public, anon, authenticated;
revoke all on function public.fechamento_visivel(uuid) from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.transferencias_caixa_recebidas(date) from public, anon, authenticated;
revoke all on function public.venda_visivel(text, text) from public, anon, authenticated;

-- RPCs realmente chamadas pelo frontend autenticado.
grant execute on function public.salvar_fechamento(jsonb) to authenticated;
grant execute on function public.buscar_transferencia_tesouraria_por_lacre(text) to authenticated;
grant execute on function public.cash_session_caixa_turno_permitido(text, text) to authenticated;
grant execute on function public.criar_retorno_automatico_tesouraria(uuid, text, text, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.criar_sangria_automatica_tesouraria(uuid, text, text, numeric) to authenticated;
grant execute on function public.fechamento_editavel(uuid) to authenticated;
grant execute on function public.fechamento_visivel(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.transferencias_caixa_recebidas(date) to authenticated;
grant execute on function public.venda_visivel(text, text) to authenticated;

-- Evita resolução de objetos por schemas controlados pelo chamador.
alter function public.set_atualizado_em() set search_path = public, pg_catalog;
alter function public.salvar_fechamento(jsonb) set search_path = public, pg_catalog;
