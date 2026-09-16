import { describe, expect, it } from 'vitest';
import { mapearFechamentoCaixaDia, mapearVendaProdutoDia } from './mapearLinhasBot';

describe('mapearFechamentoCaixaDia', () => {
  it('mapeia uma linha real do bot (valores com vírgula, data DD/MM/YYYY)', () => {
    const linha = mapearFechamentoCaixaDia({
      DATA_VENDA: '21/08/2026',
      PDV: 'PDV 1',
      OPERADOR: 'VND CAIXA PDV - 1M',
      HORA: '8',
      PRIMEIRA_VENDA: '2026-08-21 08:03:12',
      ULTIMA_VENDA: '2026-08-21 21:47:05',
      NUMERO_VENDAS: '128',
      CREDIARIO: '0,00',
      CREDITO: '1234,56',
      DEBITO: '890,10',
      DINHEIRO: '456,78',
      PIX: '321,00',
      VOUCHER: '0,00',
      OUTROS: '0,00',
      TOTAL_PAGAMENTO: '2902,44',
      CLIENTES: '150,00',
      COLABORADORES: '0,00',
      ALIMENTACAO: '0,00',
      ROUBO_FURTO: '0,00',
      SOCIOS: '0,00',
      SOBRA_PERDA: '0,00',
      EMPRESA: 'TNP CENTRAL',
      ATUALIZADO_EM: '2026-08-22 22:10:03',
      CHAVE: 'TNP CENTRAL|21/08/2026|PDV 1|VND CAIXA PDV - 1M',
      CAIXA: '1',
      TURNO: 'M',
      COLABORADOR: 'LILIANY',
      HASH: 'abc123',
    });

    expect(linha.data_venda).toBe('2026-08-21');
    expect(linha.hora).toBe(8);
    expect(linha.credito).toBeCloseTo(1234.56);
    expect(linha.total_pagamento).toBeCloseTo(2902.44);
    expect(linha.numero_vendas).toBe(128);
    expect(linha.caixa).toBe('1');
    expect(linha.turno).toBe('M');
    expect(linha.colaborador).toBe('LILIANY');
    expect(linha.hash).toBe('abc123');
    expect(linha.primeira_venda).not.toBeNull();
    expect(linha.ultima_venda).not.toBeNull();
  });

  it('data inválida vira null (sinal pro endpoint rejeitar o payload)', () => {
    const linha = mapearFechamentoCaixaDia({
      DATA_VENDA: 'não é uma data',
      PDV: 'PDV 1',
      OPERADOR: 'X',
      EMPRESA: 'TNP CENTRAL',
      HASH: 'h',
    } as never);
    expect(linha.data_venda).toBeNull();
  });

  it('campos opcionais ausentes viram 0/null, não quebram', () => {
    const linha = mapearFechamentoCaixaDia({
      DATA_VENDA: '01/01/2026',
      PDV: 'PDV 1',
      OPERADOR: 'X',
      EMPRESA: 'TNP CENTRAL',
      HASH: 'h',
    } as never);
    expect(linha.credito).toBe(0);
    expect(linha.caixa).toBeNull();
    expect(linha.hora).toBeNull();
    expect(linha.primeira_venda).toBeNull();
  });
});

describe('mapearVendaProdutoDia', () => {
  it('mapeia uma linha real do bot', () => {
    const linha = mapearVendaProdutoDia({
      DATA_VENDA: '21/08/2026',
      PRODUTO_CODIGO: '00123',
      PRODUTO: 'Pão Francês',
      QUANTIDADE: '12,5',
      VALOR_UNITARIO: '1,20',
      TOTAL: '15,00',
      EMPRESA: 'TNP CENTRAL',
      ATUALIZADO_EM: '2026-08-22 22:10:03',
      HASH: 'xyz789',
    });
    expect(linha.data_venda).toBe('2026-08-21');
    expect(linha.quantidade).toBeCloseTo(12.5);
    expect(linha.total).toBeCloseTo(15);
    expect(linha.produto_codigo).toBe('00123');
    expect(linha.hash).toBe('xyz789');
  });
});
