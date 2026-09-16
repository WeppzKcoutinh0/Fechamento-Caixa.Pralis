-- Mesma regra das demais tabelas de integração: usuário autenticado só LÊ. A escrita só acontece
-- via `service_role`, a partir de `server/routes/vendas/importar.post.ts` (nunca roda no
-- navegador), que valida a chave do bot antes de gravar — por isso não existe policy de
-- insert/update/delete para `authenticated` aqui.

alter table public.vendas_fechamento_caixa_dia enable row level security;
alter table public.vendas_produto_dia enable row level security;

create policy "vendas_fechamento_caixa_dia_authenticated_select" on public.vendas_fechamento_caixa_dia
  for select
  to authenticated
  using (true);

create policy "vendas_produto_dia_authenticated_select" on public.vendas_produto_dia
  for select
  to authenticated
  using (true);
