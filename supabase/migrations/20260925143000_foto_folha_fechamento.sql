-- Foto da folha física anexada na Transferência Final.
-- O upload continua no bucket privado `anexos`, sempre dentro da pasta do fechamento.
alter table public.fechamentos
  add column if not exists img_folha_fechamento_path text;
