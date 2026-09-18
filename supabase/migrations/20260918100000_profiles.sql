-- Camada de sessão de caixa/papéis (pedido do usuário, 18/09/2026, ver TASKS.md "Fluxo de
-- Caixa"). Até aqui NÃO existia nenhum conceito de papel/permissão — qualquer conta autenticada
-- tinha acesso igual a qualquer fechamento (decisão deliberada, documentada em
-- docs/CONTRATO-COMPORTAMENTO-ATUAL.md §6 e no comentário de 20260914090100_rls.sql). Esta
-- migration é o primeiro passo: uma tabela `profiles` ligando cada `auth.users` a um papel.
--
-- `caixa_padrao`/`turno_padrao` (nullable): pra quando uma conta é dedicada a um caixa/turno
-- específico (as 8 contas operacionais Caixa 1-4 × Manhã/Tarde) — usado só pra travar o
-- formulário de abertura no valor certo daquela conta, evitando erro humano. Fica null pra
-- contas sem caixa fixo (ex.: admin).
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'caixa')),
  nome text not null default '',
  caixa_padrao text check (caixa_padrao in ('Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4')),
  turno_padrao text check (turno_padrao in ('Manhã', 'Tarde')),
  criado_em timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Só leitura pra `authenticated` (a própria linha, ou qualquer uma se for admin — mas `is_admin()`
-- só existe na próxima migration, então essa policy usa só a parte "própria linha" por enquanto e
-- é substituída já na migration seguinte). Sem policy de escrita pra `authenticated`: todo
-- profile é criado/alterado pelo script de provisionamento com a `service_role` key (bypassa
-- RLS) — nunca pelo próprio app.
create policy "profiles_select_self" on public.profiles
  for select
  to authenticated
  using (user_id = auth.uid());
