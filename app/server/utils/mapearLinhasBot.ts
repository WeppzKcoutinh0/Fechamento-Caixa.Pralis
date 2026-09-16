import {
  parseDataBot,
  parseDataHoraBot,
  parseInteiroBot,
  parseInteiroOuNuloBot,
  parseNumeroBot,
} from './parseValoresBot';
import type { LinhaFechamentoCaixaDia, LinhaVendaProdutoDia } from '../../types/vendasFechamento';

function textoOuNulo(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto === '' ? null : texto;
}

/** Linha pronta pra `upsert` em `vendas_fechamento_caixa_dia`. `data_venda: null` = payload malformado. */
export function mapearFechamentoCaixaDia(linha: LinhaFechamentoCaixaDia) {
  return {
    hash: linha.HASH,
    empresa: linha.EMPRESA,
    data_venda: parseDataBot(linha.DATA_VENDA),
    pdv: linha.PDV,
    operador: linha.OPERADOR,
    hora: parseInteiroOuNuloBot(linha.HORA),
    primeira_venda: parseDataHoraBot(linha.PRIMEIRA_VENDA),
    ultima_venda: parseDataHoraBot(linha.ULTIMA_VENDA),
    numero_vendas: parseInteiroBot(linha.NUMERO_VENDAS),
    crediario: parseNumeroBot(linha.CREDIARIO),
    credito: parseNumeroBot(linha.CREDITO),
    debito: parseNumeroBot(linha.DEBITO),
    dinheiro: parseNumeroBot(linha.DINHEIRO),
    pix: parseNumeroBot(linha.PIX),
    voucher: parseNumeroBot(linha.VOUCHER),
    outros: parseNumeroBot(linha.OUTROS),
    total_pagamento: parseNumeroBot(linha.TOTAL_PAGAMENTO),
    clientes: parseNumeroBot(linha.CLIENTES),
    colaboradores: parseNumeroBot(linha.COLABORADORES),
    alimentacao: parseNumeroBot(linha.ALIMENTACAO),
    roubo_furto: parseNumeroBot(linha.ROUBO_FURTO),
    socios: parseNumeroBot(linha.SOCIOS),
    sobra_perda: parseNumeroBot(linha.SOBRA_PERDA),
    chave: textoOuNulo(linha.CHAVE),
    caixa: textoOuNulo(linha.CAIXA),
    turno: textoOuNulo(linha.TURNO),
    colaborador: textoOuNulo(linha.COLABORADOR),
    atualizado_em_origem: parseDataHoraBot(linha.ATUALIZADO_EM),
  };
}

/** Linha pronta pra `upsert` em `vendas_produto_dia`. `data_venda: null` = payload malformado. */
export function mapearVendaProdutoDia(linha: LinhaVendaProdutoDia) {
  return {
    hash: linha.HASH,
    empresa: linha.EMPRESA,
    data_venda: parseDataBot(linha.DATA_VENDA),
    produto_codigo: textoOuNulo(linha.PRODUTO_CODIGO),
    produto: linha.PRODUTO,
    quantidade: parseNumeroBot(linha.QUANTIDADE),
    valor_unitario: parseNumeroBot(linha.VALOR_UNITARIO),
    total: parseNumeroBot(linha.TOTAL),
    atualizado_em_origem: parseDataHoraBot(linha.ATUALIZADO_EM),
  };
}
