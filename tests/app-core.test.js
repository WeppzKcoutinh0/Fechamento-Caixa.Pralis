'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppCore = require('../FECHAMENTOCAIXA/app-core.js');

test('toCents interpreta formatos monetários sem usar ponto flutuante nos cálculos', () => {
  assert.equal(AppCore.toCents('1.234,56'), 123456);
  assert.equal(AppCore.toCents('R$ 1.234,56'), 123456);
  assert.equal(AppCore.toCents('1234.56'), 123456);
  assert.equal(AppCore.toCents('-10,05'), -1005);
  assert.equal(AppCore.toCents('(10,05)'), -1005);
  assert.equal(AppCore.toCents(0.1 + 0.2), 30);
  assert.equal(AppCore.parse(''), 0);
});

test('formatCents preserva centavos, milhares e negativos', () => {
  assert.equal(AppCore.formatCents(0), '0,00');
  assert.equal(AppCore.formatCents(5), '0,05');
  assert.equal(AppCore.formatCents(123456), '1.234,56');
  assert.equal(AppCore.formatCents(-123456), '-1.234,56');
});

test('funções monetárias rejeitam valores não finitos e centavos fracionários', () => {
  assert.throws(() => AppCore.toCents(Number.POSITIVE_INFINITY), /finito/);
  assert.throws(() => AppCore.formatCents(10.5), /inteiro seguro/);
  assert.throws(() => AppCore.calculatePdv({ dinheiro: Number.NaN }, 1), /inteiro seguro|finito/);
});

test('calculateDiscrimination arredonda no centavo e aplica os dois descontos uma vez', () => {
  assert.deepEqual(
    AppCore.calculateDiscrimination({
      quantity: 3,
      unitValueCents: 1001,
      fixedDiscountCents: 100,
      discountPercent: 10,
    }),
    {
      subtotalCents: 3003,
      fixedDiscountCents: 100,
      percentageDiscountCents: 300,
      totalCents: 2603,
    }
  );

  assert.equal(
    AppCore.calculateDiscrimination({ quantity: 0.5, unitValueCents: 101 }).subtotalCents,
    51
  );
});

test('calculateDiscrimination limita entradas negativas e desconto acima do total', () => {
  assert.equal(
    AppCore.calculateDiscrimination({ quantity: -2, unitValueCents: 1000 }).totalCents,
    0
  );
  assert.equal(
    AppCore.calculateDiscrimination({
      quantity: 1,
      unitValueCents: 1000,
      fixedDiscountCents: 2000,
      discountPercent: 100,
    }).totalCents,
    0
  );
});

test('calculatePdv soma formas e arredonda o ticket médio ao centavo', () => {
  assert.deepEqual(
    AppCore.calculatePdv({ dinheiro: 1000, credito: 1001, pix: -1 }, 3),
    { totalCents: 2000, customerCount: 3, averageTicketCents: 667 }
  );
  assert.equal(AppCore.calculatePdv({ dinheiro: 1000 }, 0).averageTicketCents, 0);
});

test('líquido de cartão é sempre final menos inicial, inclusive quando negativo', () => {
  assert.equal(AppCore.calculateCardNet(1000, 2500), 1500);
  assert.equal(AppCore.calculateCardNet(2500, 1000), -1500);
  assert.deepEqual(
    AppCore.calculateCardNets({
      credito: { initialCents: 1000, finalCents: 2500 },
      debito: { initialCents: 800, finalCents: 500 },
    }),
    { nets: { credito: 1500, debito: -300 }, totalCents: 1200 }
  );
});

test('fechamento físico calcula esperado e diferença com centavos inteiros', () => {
  assert.deepEqual(
    AppCore.calculatePhysicalClosing({
      pdvCashCents: 100000,
      entriesCents: 10000,
      cashDropsCents: 20000,
      expensesCents: 5000,
      merchandiseCents: 3000,
      withdrawalsCents: 2000,
      countedCents: 80501,
    }),
    { expectedCents: 80000, countedCents: 80501, differenceCents: 501 }
  );
});

test('regressão: sangria reduz o esperado uma única vez', () => {
  const result = AppCore.calculatePhysicalClosing({
    pdvCashCents: 10000,
    entriesCents: 0,
    cashDropsCents: 2500,
    expensesCents: 0,
    merchandiseCents: 0,
    withdrawalsCents: 0,
    countedCents: 7500,
  });

  assert.equal(result.expectedCents, 7500);
  assert.equal(result.differenceCents, 0);
});
