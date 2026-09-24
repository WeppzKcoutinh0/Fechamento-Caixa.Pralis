-- Vendas/Produtos Cancelados (pedido do usuário, 24/09/2026): o robô de vendas (CREARE/Compliart)
-- passou a marcar itens cancelados com TIPO='C' na origem (venda_balcao.STATUS) — ver
-- integracoes-scripts/queries/VENDAS_PRODUTOS.sql, atualizada nesta mesma leva pra juntar
-- item_venda_balcao com venda_balcao e expor esse status. `default 'F'` mantém compatibilidade
-- com a planilha Google Sheets em produção hoje (bot_padaria_v3), que ainda não tem coluna TIPO —
-- linhas antigas/sem essa coluna continuam sendo tratadas como venda finalizada, sem quebrar nada.
alter table public.vendas_produto_dia
  add column if not exists tipo text not null default 'F' check (tipo in ('F', 'C'));
