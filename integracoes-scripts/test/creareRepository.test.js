import test from 'node:test';
import assert from 'node:assert/strict';
import {
  montarLinhaFechamentoCaixa,
  montarLinhaVendaProduto,
  montarLinhasVendaCreare,
} from '../src/creareRepository.js';

const linhaBase = {
  DATA_VENDA: '21/08/2026',
  PDV: 'PDV 1',
  OPERADOR: 'VND CAIXA PDV - 1M',
  PRIMEIRA_VENDA: '2026-08-21 08:03:12',
  ULTIMA_VENDA: '2026-08-21 21:47:05',
  NUMERO_VENDAS: 128,
  CREDIARIO: 0,
  CREDITO: 1234.56,
  DEBITO: 890.1,
  DINHEIRO: 456.78,
  PIX: 321,
  VOUCHER: 0,
  OUTROS: 0,
  TOTAL_PAGAMENTO: 2902.44,
  CLIENTES: 150,
  COLABORADORES: 0,
  ALIMENTACAO: 0,
  ROUBO_FURTO: 0,
  SOCIOS: 0,
  SOBRA_PERDA: 0,
};

test('montarLinhaFechamentoCaixa: extrai caixa/turno do OPERADOR e preenche EMPRESA/ATUALIZADO_EM', () => {
  const linha = montarLinhaFechamentoCaixa(linhaBase, { empresa: 'TNP CENTRAL', agora: '2026-08-22 22:10:03' });
  assert.equal(linha.CAIXA, '1');
  assert.equal(linha.TURNO, 'M');
  assert.equal(linha.EMPRESA, 'TNP CENTRAL');
  assert.equal(linha.ATUALIZADO_EM, '2026-08-22 22:10:03');
  assert.equal(linha.CHAVE, 'TNP CENTRAL|21/08/2026|PDV 1|VND CAIXA PDV - 1M');
  assert.equal(linha.COLABORADOR, '');
  assert.ok(linha.HASH && linha.HASH.length === 64);
});

test('montarLinhaFechamentoCaixa: HASH é estável para as mesmas 9 partes (idempotência)', () => {
  const contexto = { empresa: 'TNP CENTRAL', agora: '2026-08-22 22:10:03' };
  const linha1 = montarLinhaFechamentoCaixa(linhaBase, contexto);
  const linha2 = montarLinhaFechamentoCaixa({ ...linhaBase }, { empresa: 'TNP CENTRAL', agora: '2026-08-23 10:00:00' });
  // ATUALIZADO_EM mudou mas nao faz parte do HASH -> mesmo HASH.
  assert.equal(linha1.HASH, linha2.HASH);
});

test('montarLinhaFechamentoCaixa: HASH muda se NUMERO_VENDAS ou TOTAL_PAGAMENTO mudam', () => {
  const contexto = { empresa: 'TNP CENTRAL', agora: '2026-08-22 22:10:03' };
  const original = montarLinhaFechamentoCaixa(linhaBase, contexto);
  const alterado = montarLinhaFechamentoCaixa({ ...linhaBase, TOTAL_PAGAMENTO: 9999 }, contexto);
  assert.notEqual(original.HASH, alterado.HASH);
});

test('montarLinhaFechamentoCaixa: HORA passa como número quando presente, null quando ausente', () => {
  const contexto = { empresa: 'TNP CENTRAL', agora: '2026-08-22 22:10:03' };
  const comHora = montarLinhaFechamentoCaixa({ ...linhaBase, HORA: 8 }, contexto);
  assert.equal(comHora.HORA, 8);
  const semHora = montarLinhaFechamentoCaixa(linhaBase, contexto);
  assert.equal(semHora.HORA, null);
});

test('montarLinhaFechamentoCaixa: HORA não faz parte do HASH (só PRIMEIRA_VENDA/ULTIMA_VENDA já diferenciam por hora)', () => {
  const contexto = { empresa: 'TNP CENTRAL', agora: '2026-08-22 22:10:03' };
  const semHora = montarLinhaFechamentoCaixa(linhaBase, contexto);
  const comHora = montarLinhaFechamentoCaixa({ ...linhaBase, HORA: 8 }, contexto);
  assert.equal(semHora.HASH, comHora.HASH);
});

test('montarLinhaFechamentoCaixa: valores ausentes viram 0, não NaN', () => {
  const linha = montarLinhaFechamentoCaixa(
    { DATA_VENDA: '01/01/2026', PDV: 'PDV 1', OPERADOR: 'X' },
    { empresa: 'TNP CENTRAL', agora: '2026-01-01 00:00:00' },
  );
  assert.equal(linha.CREDITO, 0);
  assert.equal(linha.TOTAL_PAGAMENTO, 0);
});

test('montarLinhaVendaProduto: monta e calcula HASH', () => {
  const linha = montarLinhaVendaProduto(
    { DATA_VENDA: '21/08/2026', PRODUTO_CODIGO: '123', PRODUTO: 'Pão Francês', QUANTIDADE: 12.5, VALOR_UNITARIO: 1.2, TOTAL: 15 },
    { empresa: 'TNP CENTRAL', agora: '2026-08-22 22:10:03' },
  );
  assert.equal(linha.PRODUTO, 'Pão Francês');
  assert.equal(linha.QUANTIDADE, 12.5);
  assert.ok(linha.HASH && linha.HASH.length === 64);
});

test('montarLinhaVendaProduto: repassa IDS_VENDA_CREARE e FORMAS_PAGAMENTO da query (rastreabilidade)', () => {
  const linha = montarLinhaVendaProduto(
    {
      DATA_VENDA: '21/08/2026',
      PRODUTO_CODIGO: '123',
      PRODUTO: 'Pão Francês',
      QUANTIDADE: 1,
      VALOR_UNITARIO: 15,
      TOTAL: 15,
      IDS_VENDA_CREARE: '599538, 599539',
      FORMAS_PAGAMENTO: 'DINHEIRO, PIX',
    },
    { empresa: 'TNP CENTRAL', agora: '2026-08-22 22:10:03' },
  );
  assert.equal(linha.IDS_VENDA_CREARE, '599538, 599539');
  assert.equal(linha.FORMAS_PAGAMENTO, 'DINHEIRO, PIX');
});

test('montarLinhaVendaProduto: sem IDS_VENDA_CREARE/FORMAS_PAGAMENTO na linha, fica null (não quebra)', () => {
  const linha = montarLinhaVendaProduto(
    { DATA_VENDA: '21/08/2026', PRODUTO_CODIGO: '123', PRODUTO: 'Pão Francês', QUANTIDADE: 1, VALOR_UNITARIO: 15, TOTAL: 15 },
    { empresa: 'TNP CENTRAL', agora: '2026-08-22 22:10:03' },
  );
  assert.equal(linha.IDS_VENDA_CREARE, null);
  assert.equal(linha.FORMAS_PAGAMENTO, null);
});

test('montarLinhasVendaCreare: agrupa itens e pagamentos por ID_VENDA_BALCAO', () => {
  const dados = {
    cabecalhos: [
      { ID_VENDA_BALCAO: 501, DATA_VENDA: '25/09/2026', HORA_VENDA: '2026-09-25 10:00:00', PDV: 'TNP-PC-CXPDV-1', OPERADOR: 'VND CAIXA PDV - 1M', STATUS: 'F' },
      { ID_VENDA_BALCAO: 502, DATA_VENDA: '25/09/2026', HORA_VENDA: '2026-09-25 11:00:00', PDV: 'TNP-PC-CXPDV-2', OPERADOR: 'VND CAIXA PDV - 2M', STATUS: 'C' },
    ],
    itens: [
      { ID_VENDA_BALCAO: 501, PRODUTO_CODIGO: '1', PRODUTO: 'Pão Francês', QUANTIDADE: 2, VALOR_UNITARIO: 1.2, TOTAL: 2.4 },
      { ID_VENDA_BALCAO: 501, PRODUTO_CODIGO: '2', PRODUTO: 'Croissant', QUANTIDADE: 1, VALOR_UNITARIO: 8, TOTAL: 8 },
      { ID_VENDA_BALCAO: 502, PRODUTO_CODIGO: '3', PRODUTO: 'Coca-Cola 2L', QUANTIDADE: 1, VALOR_UNITARIO: 15.75, TOTAL: 15.75 },
    ],
    pagamentos: [
      { ID_VENDA_BALCAO: 501, FORMA_PAGAMENTO: 'DINHEIRO', VALOR: 5.4 },
      { ID_VENDA_BALCAO: 501, FORMA_PAGAMENTO: 'PIX', VALOR: 5 },
    ],
  };
  const linhas = montarLinhasVendaCreare(dados, { empresa: 'TNP CENTRAL', agora: '2026-09-25 12:00:00' });

  assert.equal(linhas.length, 2);
  const venda501 = linhas.find((l) => l.ID_VENDA_CREARE === '501');
  assert.equal(venda501.STATUS, 'F');
  assert.equal(venda501.ITENS.length, 2);
  assert.equal(venda501.PAGAMENTOS.length, 2);
  assert.equal(venda501.PAGAMENTOS[0].FORMA_PAGAMENTO, 'DINHEIRO');

  const venda502 = linhas.find((l) => l.ID_VENDA_CREARE === '502');
  assert.equal(venda502.STATUS, 'C');
  assert.equal(venda502.ITENS.length, 1);
  assert.equal(venda502.PAGAMENTOS.length, 0);
});

test('montarLinhasVendaCreare: venda sem ID_VENDA_BALCAO vira ID_VENDA_CREARE null (não inventa)', () => {
  const linhas = montarLinhasVendaCreare(
    {
      cabecalhos: [{ ID_VENDA_BALCAO: null, DATA_VENDA: '25/09/2026', HORA_VENDA: null, PDV: null, OPERADOR: null, STATUS: 'F' }],
      itens: [],
      pagamentos: [],
    },
    { empresa: 'TNP CENTRAL', agora: '2026-09-25 12:00:00' },
  );
  assert.equal(linhas[0].ID_VENDA_CREARE, null);
});
