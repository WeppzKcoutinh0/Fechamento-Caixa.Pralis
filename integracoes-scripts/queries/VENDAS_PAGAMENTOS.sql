-- Fluxo oficial CREARE -> robô -> API (pedido do usuário, 25/09/2026): uma forma de pagamento por
-- linha (uma venda pode ter 2-3 formas) — junta com VENDAS.sql por ID_VENDA_BALCAO em
-- creareRepository.js. Mesmos joins já testados em FECHAMENTO_CAIXA.sql.
SELECT
    fvb.ID_VENDA_BALCAO,
    fp.DESCRICAO AS FORMA_PAGAMENTO,
    ROUND(fvb.VALOR_LIQUIDO, 2) AS VALOR
FROM formapgto_venda_balcao fvb
LEFT JOIN venda_balcao vb
    ON vb.ID_VENDA_BALCAO = fvb.ID_VENDA_BALCAO
LEFT JOIN forma_pagamento fp
    ON fp.ID_FORMAPGTO = fvb.ID_FORMAPGTO
WHERE DATE(vb.DTHR_VENDABALCAO) >= {{VALOR_DATA}}
ORDER BY fvb.ID_VENDA_BALCAO;
