-- Fluxo oficial CREARE -> robô -> API (pedido do usuário, 25/09/2026): um item por linha, SEM
-- agregação por dia (diferente de VENDAS_PRODUTOS.sql) — junta com VENDAS.sql por
-- ID_VENDA_BALCAO em creareRepository.js. Mesmos joins já testados naquela query.
SELECT
    ivb.ID_VENDA_BALCAO,
    cp.CODIGO AS PRODUTO_CODIGO,
    ivb.DESCRICAO_PRODUTO AS PRODUTO,
    ROUND(ivb.QUANTIDADE, 2) AS QUANTIDADE,
    ROUND(ivb.UNITARIO, 2) AS VALOR_UNITARIO,
    ROUND(ivb.TOTAL_ITEM_LIQUIDO_RATEIO, 2) AS TOTAL
FROM item_venda_balcao ivb
LEFT JOIN venda_balcao vb
    ON vb.ID_VENDA_BALCAO = ivb.ID_VENDA_BALCAO
LEFT JOIN produto p
    ON ivb.ID_PRODUTO = p.ID_PRODUTO
LEFT JOIN codigo_produto cp
    ON cp.ID_CODIGO_PRODUTO = p.ID_CODIGO_PRODUTO_PADRAO
WHERE DATE(vb.DTHR_VENDABALCAO) >= {{VALOR_DATA}}
ORDER BY ivb.ID_VENDA_BALCAO;
