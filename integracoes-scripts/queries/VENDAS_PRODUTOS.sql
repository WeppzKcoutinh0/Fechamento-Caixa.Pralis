-- TIPO (pedido do usuário, 24/09/2026): junta com venda_balcao pra expor o STATUS da venda de
-- origem de cada item — 'F' (finalizada) continua sendo a maioria de sempre, 'C' (cancelada) é
-- novo. Agrupa também por STATUS pra não misturar quantidade/valor de itens cancelados com
-- finalizados do mesmo produto/dia numa única linha (ficam em linhas separadas, cada uma com seu
-- próprio TIPO). NÃO entra no HASH (ver creareRepository.js#montarLinhaVendaProduto) — mudar o
-- HASH reimportaria a base inteira; a diferença natural de QUANTIDADE/TOTAL entre um agregado
-- cancelado e um finalizado já garante hashes distintos na prática.
SELECT
    DATE_FORMAT(ivb.DTHR_ITEM_VENDABALCAO, '%d/%m/%Y') AS DATA_VENDA,
    cp.CODIGO AS PRODUTO_CODIGO,
    ivb.DESCRICAO_PRODUTO AS PRODUTO,
    ROUND(SUM(ivb.QUANTIDADE), 2) AS QUANTIDADE,
    ROUND(AVG(ivb.UNITARIO), 2) AS VALOR_UNITARIO,
    ROUND(SUM(ivb.TOTAL_ITEM_LIQUIDO_RATEIO), 2) AS TOTAL,
    CASE WHEN vb.STATUS = 'C' THEN 'C' ELSE 'F' END AS TIPO
FROM item_venda_balcao ivb
LEFT JOIN produto p
    ON ivb.ID_PRODUTO = p.ID_PRODUTO
LEFT JOIN codigo_produto cp
    ON cp.ID_CODIGO_PRODUTO = p.ID_CODIGO_PRODUTO_PADRAO
LEFT JOIN venda_balcao vb
    ON vb.ID_VENDA_BALCAO = ivb.ID_VENDA_BALCAO
WHERE DATE(ivb.DTHR_ITEM_VENDABALCAO) >= {{VALOR_DATA}}
GROUP BY
    ivb.ID_PRODUTO,
    cp.CODIGO,
    ivb.DESCRICAO_PRODUTO,
    DATE(ivb.DTHR_ITEM_VENDABALCAO),
    vb.STATUS
ORDER BY
    DATE(ivb.DTHR_ITEM_VENDABALCAO) DESC,
    ivb.DESCRICAO_PRODUTO;
