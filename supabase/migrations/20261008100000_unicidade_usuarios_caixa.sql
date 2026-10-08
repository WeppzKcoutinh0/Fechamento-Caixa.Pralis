-- Cada caixa/turno operacional possui uma única conta dedicada.
-- A regra fica no banco para impedir duplicidade mesmo em cadastros simultâneos.
create unique index if not exists profiles_um_usuario_por_caixa_turno
  on public.profiles (caixa_padrao, turno_padrao)
  where role = 'caixa' and caixa_padrao is not null and turno_padrao is not null;
