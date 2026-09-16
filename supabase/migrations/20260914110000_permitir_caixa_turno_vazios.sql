-- O contrato de comportamento atual é claro: "não existe <form> ... não valida nada; pode
-- salvar com data, caixa, turno, responsavel vazios". O schema original exigia caixa/turno
-- dentro da lista de valores válidos SEM permitir vazio — mais rígido que o app de hoje,
-- o que bloquearia um salvamento que hoje funciona (regressão de comportamento).
-- Corrige: aceita '' (não selecionado) além dos 4 valores reais, sem exigir NOT NULL.

alter table public.fechamentos drop constraint fechamentos_caixa_check;
alter table public.fechamentos drop constraint fechamentos_turno_check;

alter table public.fechamentos alter column caixa drop not null;
alter table public.fechamentos alter column caixa set default '';
alter table public.fechamentos add constraint fechamentos_caixa_check
  check (caixa is null or caixa in ('', 'Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4'));

alter table public.fechamentos alter column turno drop not null;
alter table public.fechamentos alter column turno set default '';
alter table public.fechamentos add constraint fechamentos_turno_check
  check (turno is null or turno in ('', 'Manhã', 'Tarde'));
