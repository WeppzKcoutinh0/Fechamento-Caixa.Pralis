import { describe, expect, it } from 'vitest';
import { agregarCanceladosPorProdutoDia } from './agregarVendasCanceladas';

describe('agregarCanceladosPorProdutoDia', () => {
  it('mantém cada transação CANCELADA como sua própria linha, com data e horário separados', () => {
    const linhas = agregarCanceladosPorProdutoDia(
      [
        {
          TIPO: 'CANCELADA',
          PRODUTO: 'COCA COLA 2L',
          PDV: 'TNP-PC-CXPDV-1',
          DATA_VENDA_BALCAO: '2026-09-24 12:29:47',
          ID_VENDA_BALCAO: '599538',
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
          ID_VENDA_BALCAO: '599539',
          VALOR_UNITARIO: '15,75',
          QUANTIDADE: '1',
          TOTAL: '15,75',
          EMPRESA: 'TNP CENTRAL',
          ATUALIZADO_EM: '2026-09-24 13:40:42',
          HASH: 'transacao-2',
        },
      ],
      'TNP CENTRAL',
    );

    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.HASH)).toEqual(['transacao-1', 'transacao-2']);
    expect(linhas[0]!.DATA_VENDA).toBe('2026-09-24');
    // HORA_VENDA sai cru aqui (mapearVendaProdutoDia extrai a hora de verdade depois).
    expect(linhas[0]!.HORA_VENDA).toBe('2026-09-24 12:29:47');
    expect(linhas[1]!.HORA_VENDA).toBe('2026-09-24 13:34:27');
    expect(linhas[0]!.TIPO).toBe('C');
    expect(linhas[1]!.VENDA_CREARE_ID).toBe('599539');
    expect(linhas[0]!.QUANTIDADE).toBe('1');
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

  it('ignora PDV que não é um caixa real da loja (máquina de teste/dev, achado real 24/09/2026)', () => {
    const linhas = agregarCanceladosPorProdutoDia(
      [
        {
          TIPO: 'CANCELADA',
          PRODUTO: 'COCA COLA 2L',
          PDV: 'DESKTOP-2SJ5JIJ',
          OPERADOR: 'teste',
          DATA_VENDA_BALCAO: '2026-09-24 12:40:48',
          QUANTIDADE: '1',
          TOTAL: '15,75',
          EMPRESA: 'TNP CENTRAL',
          ATUALIZADO_EM: '2026-09-24 12:41:25',
          HASH: 'h-teste',
        },
        {
          TIPO: 'CANCELADA',
          PRODUTO: 'BEBIDA LACTEA PIRAKIDS 200ML',
          PDV: 'SERVIDOR-PRALIS',
          DATA_VENDA_BALCAO: '2026-09-24 13:00:00',
          QUANTIDADE: '1',
          TOTAL: '3',
          EMPRESA: 'TNP CENTRAL',
          ATUALIZADO_EM: '2026-09-24 13:01:00',
          HASH: 'h-servidor',
        },
        {
          TIPO: 'CANCELADA',
          PRODUTO: 'PAO DE SAL',
          PDV: 'TNP-PC-CXPDV-1',
          DATA_VENDA_BALCAO: '2026-09-24 13:34:27',
          QUANTIDADE: '1',
          TOTAL: '2,5',
          EMPRESA: 'TNP CENTRAL',
          ATUALIZADO_EM: '2026-09-24 13:40:42',
          HASH: 'h-real',
        },
      ],
      'TNP CENTRAL',
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.HASH).toBe('h-real');
  });

  it('sem HASH na origem, deriva um hash estável pra não colidir com outra transação', () => {
    const linhas = agregarCanceladosPorProdutoDia(
      [
        {
          TIPO: 'CANCELADA',
          PRODUTO: 'BOLINHO DE CHUVA',
          PDV: 'TNP-PC-CXPDV-4',
          DATA_VENDA_BALCAO: '2026-09-23 17:49:38',
          QUANTIDADE: '1',
          TOTAL: '1,2',
          EMPRESA: 'TNP CENTRAL',
          ATUALIZADO_EM: '2026-09-23 17:52:54',
          HASH: '',
        },
      ],
      'TNP CENTRAL',
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.HASH).toBeTruthy();
  });
});
