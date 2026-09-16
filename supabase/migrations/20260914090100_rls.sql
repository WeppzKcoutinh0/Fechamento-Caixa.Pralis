-- RLS: fiel ao comportamento atual, qualquer usuário AUTENTICADO pode ler/criar/editar/excluir
-- qualquer fechamento (não existe permissão por cargo/autor hoje, e a decisão do plano foi não
-- inventar uma). Usuário anônimo (sem login) não tem nenhum acesso — isso é o que muda: hoje o
-- "login" é um prompt() fake sem nenhuma proteção real.

alter table public.fechamentos enable row level security;
alter table public.entradas enable row level security;
alter table public.sangrias enable row level security;
alter table public.lancamentos enable row level security;
alter table public.discriminacoes enable row level security;
alter table public.crediario_itens enable row level security;

create policy "fechamentos_authenticated_all" on public.fechamentos
  for all
  to authenticated
  using (true)
  with check (true);

create policy "entradas_authenticated_all" on public.entradas
  for all
  to authenticated
  using (true)
  with check (true);

create policy "sangrias_authenticated_all" on public.sangrias
  for all
  to authenticated
  using (true)
  with check (true);

create policy "lancamentos_authenticated_all" on public.lancamentos
  for all
  to authenticated
  using (true)
  with check (true);

create policy "discriminacoes_authenticated_all" on public.discriminacoes
  for all
  to authenticated
  using (true)
  with check (true);

create policy "crediario_itens_authenticated_all" on public.crediario_itens
  for all
  to authenticated
  using (true)
  with check (true);
