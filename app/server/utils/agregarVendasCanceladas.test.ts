import { describe, expect, it } from 'vitest';
import { agregarCanceladosPorProdutoDia } from './agregarVendasCanceladas';

describe('agregarCanceladosPorProdutoDia', () => {
  it('agrega várias transações CANCELADA do mesmo produto/dia numa única linha, somando quantidade e total', () => {
    const linhas = agregarCanceladosPorProdutoDia(
      [
        {
          TIPO: 'CANCELADA',
          PRODUTO: 'COCA COLA 2L',
          PDV: 'TNP-PC-CXPDV-1',
          DATA_VENDA_BALCAO: '2026-09-24 12:29:47',
          VALOR_UNITARIO: '15,75',
          QUANTIDADE: '1',
          TOTAL: '15,75',
          EMPRESA: 'TNP CENTRAL',
          ATUALIZADO_EM: '2026-09-24 12:37:28',
          HASH: 'transacao-1',
        },
        {
          TIPO: 'CANCELADA',
          PRODUTO: 'COCA COLA 2L',
          PDV: 'TNP-PC-CXPDV-2',
          DATA_VENDA_BALCAO: '2026-09-24 13:34:27',
          VALOR_UNITARIO: '15,75',
          QUANTIDADE: '2',
          TOTAL: '31,50',
          EMPRESA: 'TNP CENTRAL',
          ATUALIZADO_EM: '2026-09-24 13:40:42',
          HASH: 'transacao-2',
        },
      ],
      'TNP CENTRAL',
    );

    expect(linhas).toHaveLength(1);
    const linha = linhas[0]!;
    expect(linha.DATA_VENDA).toBe('2026-09-24');
    expect(linha.PRODUTO).toBe('COCA COLA 2L');
    expect(linha.TIPO).toBe('C');
    expect(linha.QUANTIDADE).toBe('3');
    expect(linha.TOTAL).toBe('47.25');
    expect(linha.HASH).toBeTruthy();
  });

  it('ignora linhas CREDIARIO (só cancelamento interessa aqui)', () => {
    const linhas = agregarCanceladosPorProdutoDia(
      [
        {
          TIPO: 'CREDIARIO',
          PRODUTO: 'PAO DE SAL',
          DATA_VENDA_BALCAO: '2026-09-24 06:11:11',
          QUANTIDADE: '1',
          TOTAL: '5',
          EMPRESA: 'TNP CENTRAL',
          ATUALIZADO_EM: '2026-09-24 06:12:14',
          HASH: 'h1',
        },
      ],
      'TNP CENTRAL',
    );
    expect(linhas).toHaveLength(0);
  });

  it('ignora linhas de outra empresa', () => {
    const linhas = agregarCanceladosPorProdutoDia(
      [
        {
          TIPO: 'CANCELADA',
          PRODUTO: 'PAO DOCE',
          DATA_VENDA_BALCAO: '2026-09-24 10:00:00',
          QUANTIDADE: '1',
          TOTAL: '9,9',
          EMPRESA: 'LISBOA CENTRAL',
          ATUALIZADO_EM: '2026-09-24 10:01:00',
          HASH: 'h2',
        },
      ],
      'TNP CENTRAL',
    );
    expect(linhas).toHaveLength(0);
  });

  it('duas transações do mesmo produto em dias diferentes viram duas linhas separadas', () => {
    const linhas = agregarCanceladosPorProdutoDia(
      [
        {
          TIPO: 'CANCELADA',
          PRODUTO: 'BOLINHO DE CHUVA',
          DATA_VENDA_BALCAO: '2026-09-23 17:49:38',
          QUANTIDADE: '1',
          TOTAL: '1,2',
          EMPRESA: 'TNP CENTRAL',
          ATUALIZADO_EM: '2026-09-23 17:52:54',
          HASH: 'h3',
        },
        {
          TIPO: 'CANCELADA',
          PRODUTO: 'BOLINHO DE CHUVA',
          DATA_VENDA_BALCAO: '2026-09-24 09:00:00',
          QUANTIDADE: '1',
          TOTAL: '1,2',
          EMPRESA: 'TNP CENTRAL',
          ATUALIZADO_EM: '2026-09-24 09:01:00',
          HASH: 'h4',
        },
      ],
      'TNP CENTRAL',
    );
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.DATA_VENDA).sort()).toEqual(['2026-09-23', '2026-09-24']);
  });
});
