-- Fluxo oficial CREARE -> robô -> API (pedido do usuário, 25/09/2026): cabeçalho de cada venda,
-- uma linha por venda (não mais agregado por produto/dia) — usado junto com VENDAS_ITENS.sql e
-- VENDAS_PAGAMENTOS.sql (mesmo ID_VENDA_BALCAO), agrupados em JS por creareRepository.js.
-- STATUS sai cru ('F'/'C') — a tradução pra FINALIZADA/CANCELADA é feita em mapearLinhasBot.ts,
-- igual VENDAS_PRODUTOS.sql já fazia.
SELECT
    vb.ID_VENDA_BALCAO,
    DATE_FORMAT(vb.DTHR_VENDABALCAO, '%d/%m/%Y') AS DATA_VENDA,
    -- Data+hora completa (não só a hora) de propósito: extrairHoraBot() em parseValoresBot.ts
    -- espera esse formato, mesmo padrão já usado por VENDAS_TIPOS!DATA_VENDA_BALCAO.
    DATE_FORMAT(vb.DTHR_VENDABALCAO, '%Y-%m-%d %H:%i:%s') AS HORA_VENDA,
    d.DESCRICAO AS PDV,
    u.USUARIO AS OPERADOR,
    vb.STATUS
FROM venda_balcao vb
LEFT JOIN usuario u ON u.ID_USUARIO = vb.ID_USUARIO
LEFT JOIN dispositivo d ON d.ID_DISPOSITIVO = vb.ID_DISPOSITIVO
WHERE DATE(vb.DTHR_VENDABALCAO) >= {{VALOR_DATA}}
ORDER BY vb.DTHR_VENDABALCAO DESC;
