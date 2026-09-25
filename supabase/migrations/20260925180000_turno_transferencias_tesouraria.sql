-- Pedido do usuário (25/09/2026): "direcionar" uma transferência pra um Caixa sem dizer de qual
-- turno era ambíguo (ex.: "Caixa 1" podia ser manhã ou tarde) — puramente informativo, não muda
-- a lógica de retorno automático/sangria automática existente (que já casa só por `caixa`, sem
-- turno, e continua funcionando igual).
alter table public.transferencias_tesouraria
  add column if not exists turno_origem text check (turno_origem in ('Manhã', 'Tarde')),
  add column if not exists turno_destino text check (turno_destino in ('Manhã', 'Tarde'));
