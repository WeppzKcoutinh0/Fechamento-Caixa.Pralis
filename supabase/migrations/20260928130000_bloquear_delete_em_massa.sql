-- Incidente 28/09/2026: um `delete from public.fechamentos` rodado direto no banco (sem WHERE)
-- apagou TODOS os fechamentos e tabelas filhas — sem backup no plano Free, sem recuperação
-- possível. Esta trava impede que isso aconteça de novo: um DELETE que apague mais de 3
-- fechamentos de uma vez é bloqueado (a transação inteira é revertida).
--
-- A trava fica só em `fechamentos` (a linha-mãe, identidade de cada caixa fechado) — não nas
-- tabelas filhas: `salvar_fechamento` reescreve os filhos de UM fechamento a cada edição
-- (delete por fechamento_id + reinsert, na mesma transação) e uma discriminação/lançamento de um
-- único fechamento real pode legitimamente passar de 3 linhas — travar ali quebraria o fluxo
-- normal de salvar. Apagar mais de 3 fechamentos inteiros de uma vez, por outro lado, nunca é
-- uma operação normal do app.
--
-- Uma exclusão legítima em massa (ex.: limpeza deliberada de dados de teste) ainda é possível,
-- mas só se a própria sessão pedir explicitamente, ANTES do DELETE:
--   set local app.permitir_delete_em_massa = 'true';

create or replace function public.bloquear_delete_em_massa()
returns trigger
language plpgsql
as $$
declare
  v_count integer;
  v_limite constant integer := 3;
begin
  if current_setting('app.permitir_delete_em_massa', true) = 'true' then
    return null;
  end if;

  select count(*) into v_count from old_table;

  if v_count > v_limite then
    raise exception
      'DELETE em massa bloqueado em %: % linhas seriam apagadas de uma vez (limite %). '
      'Isso quase sempre é um script sem WHERE. Se for intencional, rode antes na mesma sessão: '
      'set local app.permitir_delete_em_massa = ''true'';',
      TG_TABLE_NAME, v_count, v_limite
      using errcode = '23514';
  end if;

  return null;
end;
$$;

drop trigger if exists bloquear_delete_em_massa on public.fechamentos;
create trigger bloquear_delete_em_massa
  after delete on public.fechamentos
  referencing old table as old_table
  for each statement
  execute function public.bloquear_delete_em_massa();
