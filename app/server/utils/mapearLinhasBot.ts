import {
  extrairHoraBot,
  parseDataBot,
  parseDataHoraBot,
  parseInteiroBot,
  parseInteiroOuNuloBot,
  parseNumeroBot,
} from './parseValoresBot';
import type {
  LinhaFechamentoCaixaDia,
  LinhaVendaCreare,
  LinhaVendaProdutoDia,
} from '../../types/vendasFechamento';

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
    venda_creare_id:
      textoOuNulo(linha.IDS_VENDA_CREARE) ??
      textoOuNulo(linha.VENDA_CREARE_ID) ??
      textoOuNulo(linha.ID_VENDA_BALCAO) ??
      textoOuNulo(linha.ID_VENDA) ??
      textoOuNulo(linha.ID_VENDA_CREARE) ??
      textoOuNulo(linha.CREARE_ID),
    forma_pagamento:
      textoOuNulo(linha.FORMA_PAGAMENTO) ??
      textoOuNulo(linha.FORMAS_PAGAMENTO) ??
      textoOuNulo(linha.FORMA) ??
      textoOuNulo(linha.PAGAMENTO) ??
      textoOuNulo(linha.DESCRICAO_PAGAMENTO),
    produto_codigo: textoOuNulo(linha.PRODUTO_CODIGO),
    produto: linha.PRODUTO,
    quantidade: parseNumeroBot(linha.QUANTIDADE),
    valor_unitario: parseNumeroBot(linha.VALOR_UNITARIO),
    total: parseNumeroBot(linha.TOTAL),
    // 'C' só quando a origem manda exatamente isso — qualquer outra coisa (ausente, 'F', lixo) é
    // finalizada, mesmo default da coluna no banco (ver migration 20260924100000).
    tipo: linha.TIPO === 'C' ? 'C' : 'F',
    hora_venda: extrairHoraBot(linha.HORA_VENDA),
    atualizado_em_origem: parseDataHoraBot(linha.ATUALIZADO_EM),
  };
}

/**
 * Fluxo oficial CREARE -> robô -> API (pedido do usuário, 25/09/2026): mapeia uma venda completa
 * (cabeçalho + itens + pagamentos) pronta pra `importarVendaCreare()` em `importarVendas.ts`.
 * `id_creare: null` aqui significa "a origem não trouxe ID" — quem chama decide o que fazer
 * (não inventamos um ID aqui, ver regra do usuário).
 */
export function mapearVendaCreare(linha: LinhaVendaCreare) {
  const idOrigem = textoOuNulo(linha.ID_VENDA_CREARE);
  const itens = linha.ITENS.map((item) => ({
    produto_codigo: textoOuNulo(item.PRODUTO_CODIGO),
    produto: item.PRODUTO,
    quantidade: parseNumeroBot(item.QUANTIDADE),
    valor_unitario: parseNumeroBot(item.VALOR_UNITARIO),
    total: parseNumeroBot(item.TOTAL),
    // Sem status por item na origem: replica o status da venda inteira (regra do usuário —
    // "quando houver" implica que pode não vir; sem informação melhor, o item segue a venda).
    cancelado: item.CANCELADO ?? linha.STATUS === 'C',
  }));
  const pagamentos = linha.PAGAMENTOS.map((pagamento) => ({
    forma_pagamento: pagamento.FORMA_PAGAMENTO,
    valor: parseNumeroBot(pagamento.VALOR),
  }));
  // Total da venda: soma dos pagamentos (valor de fato cobrado) quando existir; cai pra soma dos
  // itens só se a origem não mandou pagamento nenhum (nunca inventa um terceiro número).
  const valorTotal =
    pagamentos.length > 0
      ? pagamentos.reduce((soma, p) => soma + p.valor, 0)
      : itens.reduce((soma, i) => soma + i.total, 0);

  return {
    id_creare: idOrigem ? `CREARE:${idOrigem}` : null,
    empresa: linha.EMPRESA,
    data_venda: parseDataBot(linha.DATA_VENDA),
    hora_venda: extrairHoraBot(linha.HORA_VENDA),
    pdv: textoOuNulo(linha.PDV),
    operador: textoOuNulo(linha.OPERADOR),
    status: linha.STATUS === 'C' ? ('CANCELADA' as const) : ('FINALIZADA' as const),
    valor_total: valorTotal,
    atualizado_em_origem: parseDataHoraBot(linha.ATUALIZADO_EM),
    itens,
    pagamentos,
  };
}
