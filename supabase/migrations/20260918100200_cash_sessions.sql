-- Sessão de caixa: uma linha por abertura (Caixa N + Turno + dia). Só 2 estados (ABERTO/FECHADO)
-- — "encerrar sessão esquecida sem fechamento" (pedido do usuário) é representado com
-- status='FECHADO' e fechamento_id continuando null, não precisa de um 3º estado.
--
-- `business_date` NÃO tem default: `current_date` do Postgres é UTC, mas `hojeISO()` (usado em
-- todo o app pra "hoje", inclusive no campo Data já travado do fechamento) é a data LOCAL do
-- navegador — um caixa abrindo entre ~21h-23h59 BRT já estaria em outro dia UTC. O cliente
-- sempre manda `hojeISO()` explicitamente, igual já faz hoje pro campo `data` do fechamento.
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  caixa text not null check (caixa in ('Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4')),
  turno text not null check (turno in ('Manhã', 'Tarde')),
  business_date date not null,
  opened_by uuid not null references auth.users (id),
  opened_at timestamptz not null default now(),
  closed_by uuid references auth.users (id),
  closed_at timestamptz,
  status text not null default 'ABERTO' check (status in ('ABERTO', 'FECHADO')),
  fechamento_id uuid, -- FK pra fechamentos(id) adicionada só depois que a tabela existir de fato
                       -- (ela já existe desde a migration inicial, então isso é só documentação;
                       -- o `references` vem na próxima linha mesmo).
  lacre_abertura text not null default '',
  -- Captura independente do campo "Maquininhas" da etapa 4 do wizard (pedido explícito do
  -- usuário, mesmo sabendo que duplica a pergunta) — sem ligação/sincronização com aquele campo.
  maquininha_abertura text not null default ''
);

alter table public.cash_sessions
  add constraint cash_sessions_fechamento_id_fkey
  foreign key (fechamento_id) references public.fechamentos (id);

-- Duas unique indexes parciais (bloqueio de duplicidade no BANCO, não só no front):
-- 1) mesmo caixa+turno+dia não pode ter 2 sessões ABERTAS ao mesmo tempo.
-- 2) o MESMO usuário não pode ter 2 sessões ABERTAS ao mesmo tempo (em caixas diferentes) — sem
--    isso, a consulta "minha sessão aberta" (que pega só 1 resultado) esconderia silenciosamente
--    uma segunda sessão aberta pela mesma conta.
create unique index cash_sessions_uma_por_caixa_turno_dia
  on public.cash_sessions (caixa, turno, business_date)
  where status = 'ABERTO';
create unique index cash_sessions_uma_por_usuario
  on public.cash_sessions (opened_by)
  where status = 'ABERTO';

create index cash_sessions_business_date_idx on public.cash_sessions (business_date);

alter table public.cash_sessions enable row level security;

create policy "cash_sessions_select" on public.cash_sessions
  for select
  to authenticated
  using (public.is_admin() or opened_by = auth.uid());

create policy "cash_sessions_insert" on public.cash_sessions
  for insert
  to authenticated
  with check (opened_by = auth.uid());

-- Update cobre tanto o caixa fechando a própria sessão (fecharSessao) quanto o admin encerrando
-- uma sessão esquecida de qualquer operador (encerrarSemFechamento).
create policy "cash_sessions_update" on public.cash_sessions
  for update
  to authenticated
  using (public.is_admin() or opened_by = auth.uid());
