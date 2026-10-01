-- Faltou a policy de DELETE em cofre_saldo_inicial (20261001100000) — o botão "Remover corte"
-- em pages/cofres.vue chama .delete(), que sem policy nenhuma apaga 0 linhas em silêncio (RLS
-- bloqueia, mas DELETE não dá erro por isso, só afeta 0 linhas) — achado antes de ir pro ar.
create policy "cofre_saldo_inicial_delete" on public.cofre_saldo_inicial
  for delete to authenticated using (public.is_admin());
