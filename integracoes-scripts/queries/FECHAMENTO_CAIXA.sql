-- =====================================================================
-- Fechamento de caixa - TNP e LISBOA (Creare/Compilart, MySQL)
--
-- v5 - 21/08/2026: as 12 formas de pagamento, cada uma na sua coluna.
-- v6 - 16/09/2026: agrupa também por HORA da venda (0-23), além de dia/caixa/operador — permite
-- filtrar "vendas do Caixa 1 entre tal e tal horário" no app, sem precisar ir venda a venda.
-- Granularidade de hora cheia (não por minuto): cada linha agora é 1 hora daquele caixa/operador,
-- em vez do turno inteiro. HASH não muda de fórmula (ver creareRepository.js) — PRIMEIRA_VENDA/
-- ULTIMA_VENDA já saem diferentes por hora, então o hash de cada linha já fica único sozinho.
--
-- Levantado no Compilart da TNP em 21/08/2026 (45 dias):
--
--   ID  NOME NO ERP                        ->  COLUNA
--    1  DINHEIRO (VND)                     ->  DINHEIRO
--    2  DEBITO (VND/TRAN)                  ->  DEBITO
--    4  CREDITO (VND/TRANS)                ->  CREDITO
--    6  VOUCHER (VND/TRANS)                ->  VOUCHER
--    7  PIX (VND/TRANS)                    ->  PIX
--    8  CLIENTES (VND/TRANS)               ->  CLIENTES      [novo]
--   13  ROUBO/FURTO (VND/DES)              ->  ROUBO_FURTO   [novo]
--   14  COLABORADORES (VND/DES)            ->  COLABORADORES [novo]
--   15  ALIMENTACAO -66,6% (VND/DES)       ->  ALIMENTACAO   [novo]
--   16  SOCIOS/PROPRIETARIOS (VND/RET)     ->  SOCIOS        [novo]
--   17  SOBRA/PERDA -66,6% (MER)           ->  SOBRA_PERDA   [novo]
--    5  BANCO DESABILITADO                 ->  OUTROS (zerada)
--   10  TEF DEBITO DESABILITADO            ->  DEBITO  (zerada, mas ja mapeada
--   11  TEF CREDITO DESABILITADO           ->  CREDITO  para o dia em que
--   12  TEF PIX DESABILTIADO               ->  PIX      ligarem o TEF)
--
-- NAO existe mais forma chamada CREDIARIO no ERP: virou CLIENTES (VND/TRANS).
-- A coluna CREDIARIO continua no lugar por causa das ~2.500 linhas antigas,
-- e passa a sair zerada. O dinheiro do crediario agora sai em CLIENTES.
--
-- A classificacao continua por PEDACO do nome, sem acento e sem prefixo:
-- renomear de novo (mudar sigla, tirar acento, trocar o sufixo) nao quebra.
-- =====================================================================
SELECT
    x.DATA_VENDA,
    x.CAIXA AS PDV,
    x.USUARIO AS OPERADOR,
    HOUR(x.DTHR_VENDABALCAO) AS HORA,
    MIN(x.DTHR_VENDABALCAO) AS PRIMEIRA_VENDA,
    MAX(x.DTHR_VENDABALCAO) AS ULTIMA_VENDA,
    COUNT(DISTINCT x.ID_VENDA_BALCAO) AS NUMERO_VENDAS,

    -- as seis de sempre, na ordem que a planilha ja tem
    ROUND(SUM(CASE WHEN x.FORMA = 'CREDIARIO'     THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `CREDIARIO`,
    ROUND(SUM(CASE WHEN x.FORMA = 'CREDITO'       THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `CREDITO`,
    ROUND(SUM(CASE WHEN x.FORMA = 'DEBITO'        THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `DEBITO`,
    ROUND(SUM(CASE WHEN x.FORMA = 'DINHEIRO'      THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `DINHEIRO`,
    ROUND(SUM(CASE WHEN x.FORMA = 'PIX'           THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `PIX`,
    ROUND(SUM(CASE WHEN x.FORMA = 'VOUCHER'       THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `VOUCHER`,

    ROUND(SUM(CASE WHEN x.FORMA = 'OUTROS'        THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `OUTROS`,
    ROUND(SUM(x.VALOR_LIQUIDO), 2) AS TOTAL_PAGAMENTO,

    -- as seis novas, SEMPRE depois do total: o append grava por posicao
    ROUND(SUM(CASE WHEN x.FORMA = 'CLIENTES'      THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `CLIENTES`,
    ROUND(SUM(CASE WHEN x.FORMA = 'COLABORADORES' THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `COLABORADORES`,
    ROUND(SUM(CASE WHEN x.FORMA = 'ALIMENTACAO'   THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `ALIMENTACAO`,
    ROUND(SUM(CASE WHEN x.FORMA = 'ROUBO_FURTO'   THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `ROUBO_FURTO`,
    ROUND(SUM(CASE WHEN x.FORMA = 'SOCIOS'        THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `SOCIOS`,
    ROUND(SUM(CASE WHEN x.FORMA = 'SOBRA_PERDA'   THEN x.VALOR_LIQUIDO ELSE 0 END), 2) AS `SOBRA_PERDA`
FROM (
    SELECT
        DATE_FORMAT(vb.DTHR_VENDABALCAO, '%d/%m/%Y') AS DATA_VENDA,
        vb.ID_VENDA_BALCAO,
        u.ID_USUARIO,
        u.USUARIO,
        d.ID_DISPOSITIVO,
        d.DESCRICAO AS CAIXA,
        fp.ID_FORMAPGTO,
        fp.DESCRICAO AS DESCRICAO_PAGAMENTO,

        -- ---------------------------------------------------------------
        -- A ORDEM IMPORTA. As especificas primeiro; as genericas por
        -- ultimo. Todos os pedacos foram escolhidos SEM acento.
        -- ---------------------------------------------------------------
        CASE
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%CREDI%'
             AND UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%RIO%'        THEN 'CREDIARIO'
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%CLIENTE%'     THEN 'CLIENTES'
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%COLABORADOR%' THEN 'COLABORADORES'
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%ALIMENTA%'    THEN 'ALIMENTACAO'
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%ROUBO%'
              OR UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%FURTO%'       THEN 'ROUBO_FURTO'
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%SOCIO%'
              OR UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%PROPRIET%'    THEN 'SOCIOS'
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%SOBRA%'
              OR UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%PERDA%'       THEN 'SOBRA_PERDA'
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%DITO%'        THEN 'CREDITO'
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%BITO%'        THEN 'DEBITO'
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%DINHEIRO%'    THEN 'DINHEIRO'
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%PIX%'
              OR UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%P.I.X%'       THEN 'PIX'
            WHEN UPPER(COALESCE(fp.DESCRICAO, '')) LIKE '%VOUCHER%'     THEN 'VOUCHER'
            ELSE 'OUTROS'
        END AS FORMA,

        fvb.VALOR_LIQUIDO,
        vb.DTHR_VENDABALCAO
    FROM formapgto_venda_balcao fvb
    LEFT JOIN venda_balcao vb ON vb.ID_VENDA_BALCAO = fvb.ID_VENDA_BALCAO
    LEFT JOIN forma_pagamento fp ON fp.ID_FORMAPGTO = fvb.ID_FORMAPGTO
    LEFT JOIN usuario u ON u.ID_USUARIO = vb.ID_USUARIO
    LEFT JOIN dispositivo d ON d.ID_DISPOSITIVO = vb.ID_DISPOSITIVO
    WHERE DATE(vb.DTHR_VENDABALCAO) >= {{VALOR_DATA}}
      AND vb.STATUS = 'F'
) x
GROUP BY
    x.DATA_VENDA,
    x.ID_DISPOSITIVO,
    x.CAIXA,
    x.ID_USUARIO,
    x.USUARIO,
    HOUR(x.DTHR_VENDABALCAO)
ORDER BY
    x.DATA_VENDA DESC,
    x.CAIXA,
    x.USUARIO,
    HORA;
