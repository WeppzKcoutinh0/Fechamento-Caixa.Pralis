import { describe, expect, it } from 'vitest';
import {
  calculateCardNet,
  calculateCardNets,
  calculateCrediarioTotais,
  calculateDiscrimination,
  calculateLancamentosPorTipo,
  calculatePdvEntradas,
  calculatePhysicalClosing,
  calculateRelatorioFinal,
  centsToDecimalString,
  formatCents,
  sumValores,
  toCents,
} from './financeiro';

describe('toCents', () => {
  it('interpreta formatos monetários sem usar ponto flutuante nos cálculos', () => {
    expect(toCents('1.234,56')).toBe(123456);
    expect(toCents('R$ 1.234,56')).toBe(123456);
    expect(toCents('1234.56')).toBe(123456);
    expect(toCents('-10,05')).toBe(-1005);
    expect(toCents('(10,05)')).toBe(-1005);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents('')).toBe(0);
  });
});

describe('formatCents', () => {
  it('preserva centavos, milhares e negativos', () => {
    expect(formatCents(0)).toBe('0,00');
    expect(formatCents(5)).toBe('0,05');
    expect(formatCents(123456)).toBe('1.234,56');
    expect(formatCents(-123456)).toBe('-1.234,56');
  });

  it('rejeita centavos fracionários', () => {
    expect(() => formatCents(10.5)).toThrow(/inteiro seguro/);
  });
});

describe('centsToDecimalString — boundary de escrita no Postgres numeric', () => {
  it('produz decimal com ponto, sem separador de milhar', () => {
    expect(centsToDecimalString(123456)).toBe('1234.56');
    expect(centsToDecimalString(5)).toBe('0.05');
    expect(centsToDecimalString(-123456)).toBe('-1234.56');
    expect(centsToDecimalString(0)).toBe('0.00');
  });

  it('é o inverso exato de toCents para o mesmo valor', () => {
    expect(toCents(centsToDecimalString(80501))).toBe(80501);
  });
});

describe('sumValores — calcTotalEntrada / calcTotalSangria', () => {
  it('soma uma lista de entradas ou sangrias', () => {
    expect(sumValores([{ valorCents: 1000 }, { valorCents: 2050 }])).toBe(3050);
    expect(sumValores([])).toBe(0);
  });
});

describe('calculateDiscrimination', () => {
  it('arredonda no centavo e aplica os dois descontos uma vez', () => {
    expect(
      calculateDiscrimination({
        quantity: 3,
        unitValueCents: 1001,
        fixedDiscountCents: 100,
        discountPercent: 10,
      }),
    ).toEqual({
      subtotalCents: 3003,
      fixedDiscountCents: 100,
      percentageDiscountCents: 300,
      totalCents: 2603,
    });
  });

  it('limita entradas negativas e desconto acima do total', () => {
    expect(calculateDiscrimination({ quantity: -2, unitValueCents: 1000 }).totalCents).toBe(0);
    expect(
      calculateDiscrimination({
        quantity: 1,
        unitValueCents: 1000,
        fixedDiscountCents: 2000,
        discountPercent: 100,
      }).totalCents,
    ).toBe(0);
  });
});

describe('calculatePdvEntradas', () => {
  function pdvEntrada(overrides: Partial<Parameters<typeof calculatePdvEntradas>[0][number]>) {
    return {
      nrClientes: 0,
      dinheiroCents: 0,
      creditoCents: 0,
      debitoCents: 0,
      pixCents: 0,
      voucherCents: 0,
      crediarioCents: 0,
      ...overrides,
    };
  }

  it('lista vazia devolve tudo zerado', () => {
    expect(calculatePdvEntradas([])).toEqual({
      totalCents: 0,
      customerCount: 0,
      averageTicketCents: 0,
      dinheiroCents: 0,
      creditoCents: 0,
      debitoCents: 0,
      pixCents: 0,
      voucherCents: 0,
      crediarioCents: 0,
    });
  });

  it('soma um único PDV e arredonda o ticket médio ao centavo', () => {
    const resultado = calculatePdvEntradas([
      pdvEntrada({ dinheiroCents: 1000, creditoCents: 1001, pixCents: -1, nrClientes: 3 }),
    ]);
    expect(resultado.totalCents).toBe(2000);
    expect(resultado.customerCount).toBe(3);
    expect(resultado.averageTicketCents).toBe(667);
    expect(calculatePdvEntradas([pdvEntrada({ dinheiroCents: 1000 })]).averageTicketCents).toBe(0);
  });

  it('soma vários PDVs do mesmo fechamento (ex.: mais de um caixa reportando vendas)', () => {
    const resultado = calculatePdvEntradas([
      pdvEntrada({ dinheiroCents: 1000, creditoCents: 500, nrClientes: 10 }),
      pdvEntrada({ dinheiroCents: 300, pixCents: 200, nrClientes: 5 }),
    ]);
    expect(resultado.dinheiroCents).toBe(1300);
    expect(resultado.creditoCents).toBe(500);
    expect(resultado.pixCents).toBe(200);
    expect(resultado.totalCents).toBe(2000);
    expect(resultado.customerCount).toBe(15);
  });
});

describe('calculateCardNet / calculateCardNets — calcCartoes', () => {
  it('líquido é sempre final menos inicial, inclusive quando negativo', () => {
    expect(calculateCardNet(1000, 2500)).toBe(1500);
    expect(calculateCardNet(2500, 1000)).toBe(-1500);
    expect(
      calculateCardNets({
        credito: { initialCents: 1000, finalCents: 2500 },
        debito: { initialCents: 800, finalCents: 500 },
      }),
    ).toEqual({ nets: { credito: 1500, debito: -300 }, totalCents: 1200 });
  });
});

describe('calculateLancamentosPorTipo — recalcularLancamentos', () => {
  it('agrupa por tipo e soma o total geral', () => {
    expect(
      calculateLancamentosPorTipo([
        { tipo: 'despesa', valorCents: 1000, valorAcrescimoCents: 0 },
        { tipo: 'despesa', valorCents: 500, valorAcrescimoCents: 0 },
        { tipo: 'mercadoria', valorCents: 2000, valorAcrescimoCents: 0 },
        { tipo: 'retirada', valorCents: 300, valorAcrescimoCents: 0 },
      ]),
    ).toEqual({ despesaCents: 1500, mercadoriaCents: 2000, retiradaCents: 300, totalCents: 3800 });
  });

  it('soma o juros/acréscimo ao valor de cada lançamento no total', () => {
    expect(
      calculateLancamentosPorTipo([
        { tipo: 'despesa', valorCents: 1000, valorAcrescimoCents: 150 },
        { tipo: 'mercadoria', valorCents: 2000, valorAcrescimoCents: 0 },
      ]),
    ).toEqual({ despesaCents: 1150, mercadoriaCents: 2000, retiradaCents: 0, totalCents: 3150 });
  });

  it('lista vazia resulta em todos os totais zerados', () => {
    expect(calculateLancamentosPorTipo([])).toEqual({
      despesaCents: 0,
      mercadoriaCents: 0,
      retiradaCents: 0,
      totalCents: 0,
    });
  });
});

describe('calculateCrediarioTotais — recalcularCrediario', () => {
  it('separa cliente/colaborador e soma o total geral', () => {
    expect(
      calculateCrediarioTotais([
        { tipo: 'cliente', valorCents: 1000 },
        { tipo: 'cliente', valorCents: 500 },
        { tipo: 'colaborador', valorCents: 200 },
      ]),
    ).toEqual({ clientesCents: 1500, colaboradoresCents: 200, totalCents: 1700 });
  });
});

describe('calculateRelatorioFinal — fórmula principal do fechamento', () => {
  it('não conta a sangria em dobro (regressão do bug 5.2 do Relatório 1)', () => {
    const result = calculateRelatorioFinal({
      totalEntradaCents: 0,
      totalSaidaCents: 2500, // sangria
      despesasCents: 0,
      mercadoriaCents: 0,
      retiradasCents: 0, // lançamentos tipo "retirada" — não deve somar a sangria de novo
      totalPdvCents: 10000,
      liqCreditoCents: 0,
      liqDebitoCents: 0,
      liqPixCents: 0,
      liqVoucherCents: 0,
      totalCrediarioCents: 0,
      pdvCreditoCents: 0,
      pdvDebitoCents: 0,
      pdvPixCents: 0,
      pdvVoucherCents: 0,
      pdvCrediarioCents: 0,
    });

    expect(result.totalSaidasCents).toBe(2500);
    expect(result.diferencaCents).toBe(7500);
    expect(result.status).toBe('sobra');
  });

  it('replica o exemplo completo do contrato de comportamento (todas as seções)', () => {
    const result = calculateRelatorioFinal({
      totalEntradaCents: 10000,
      totalSaidaCents: 20000,
      despesasCents: 5000,
      mercadoriaCents: 3000,
      retiradasCents: 2000,
      totalPdvCents: 100000,
      liqCreditoCents: 1500,
      liqDebitoCents: -300,
      liqPixCents: 200,
      liqVoucherCents: 0,
      totalCrediarioCents: 1700,
      pdvCreditoCents: 1500,
      pdvDebitoCents: -300,
      pdvPixCents: 200,
      pdvVoucherCents: 0,
      pdvCrediarioCents: 1700,
    });

    expect(result.totalSaidasCents).toBe(30000);
    expect(result.cartoesCents).toBe(1400);
    expect(result.valorTotalFinalCents).toBe(110000);
    expect(result.diferencaCents).toBe(76900);
    expect(result.diffCreditoCents).toBe(0);
    expect(result.diffDebitoCents).toBe(0);
    expect(result.diffPixCents).toBe(0);
    expect(result.diffVoucherCents).toBe(0);
    expect(result.diffCrediarioCents).toBe(0);
    expect(result.status).toBe('sobra');
  });

  it('status "falta" quando a diferença é negativa, "zero" quando exata', () => {
    const base = {
      totalEntradaCents: 0,
      totalSaidaCents: 0,
      despesasCents: 0,
      mercadoriaCents: 0,
      retiradasCents: 0,
      liqCreditoCents: 0,
      liqDebitoCents: 0,
      liqPixCents: 0,
      liqVoucherCents: 0,
      totalCrediarioCents: 0,
      pdvCreditoCents: 0,
      pdvDebitoCents: 0,
      pdvPixCents: 0,
      pdvVoucherCents: 0,
      pdvCrediarioCents: 0,
    };

    expect(calculateRelatorioFinal({ ...base, totalPdvCents: 0 }).status).toBe('zero');
    expect(calculateRelatorioFinal({ ...base, totalPdvCents: -100 }).status).toBe('falta');
  });
});

describe('calculatePhysicalClosing — card aditivo esperado × contado', () => {
  it('calcula esperado e diferença com centavos inteiros', () => {
    expect(
      calculatePhysicalClosing({
        pdvCashCents: 100000,
        entriesCents: 10000,
        cashDropsCents: 20000,
        expensesCents: 5000,
        merchandiseCents: 3000,
        withdrawalsCents: 2000,
        countedCents: 80501,
      }),
    ).toEqual({ expectedCents: 80000, countedCents: 80501, differenceCents: 501 });
  });

  it('regressão: sangria reduz o esperado uma única vez', () => {
    const result = calculatePhysicalClosing({
      pdvCashCents: 10000,
      entriesCents: 0,
      cashDropsCents: 2500,
      expensesCents: 0,
      merchandiseCents: 0,
      withdrawalsCents: 0,
      countedCents: 7500,
    });

    expect(result.expectedCents).toBe(7500);
    expect(result.differenceCents).toBe(0);
  });
});
