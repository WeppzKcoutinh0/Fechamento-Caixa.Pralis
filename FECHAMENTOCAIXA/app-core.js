(function (root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.AppCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function assertFiniteNumber(value, fieldName) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new TypeError(`${fieldName} deve ser um número finito.`);
    }
    return number;
  }

  function assertCents(value, fieldName) {
    const cents = assertFiniteNumber(value == null ? 0 : value, fieldName);
    if (!Number.isSafeInteger(cents)) {
      throw new TypeError(`${fieldName} deve ser um inteiro seguro em centavos.`);
    }
    return cents;
  }

  function normalizeMoneyString(value) {
    let text = String(value).trim();
    if (!text) return '0';

    let negative = false;
    if (/^\(.*\)$/.test(text)) {
      negative = true;
      text = text.slice(1, -1);
    }

    if (text.includes('-')) negative = true;
    text = text.replace(/[^\d.,]/g, '');
    if (!text) return '0';

    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    const decimalSeparator = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : '';

    let integerPart = text;
    let decimalPart = '';
    if (decimalSeparator) {
      const separatorIndex = text.lastIndexOf(decimalSeparator);
      const possibleDecimals = text.slice(separatorIndex + 1);
      const separatorCount = text.split(decimalSeparator).length - 1;
      const otherSeparator = decimalSeparator === ',' ? '.' : ',';
      const hasOtherSeparator = text.includes(otherSeparator);
      const isDecimal = possibleDecimals.length <= 2 || hasOtherSeparator;

      if (isDecimal) {
        integerPart = text.slice(0, separatorIndex);
        decimalPart = possibleDecimals;
      } else if (separatorCount === 1 && possibleDecimals.length !== 3) {
        integerPart = text.slice(0, separatorIndex);
        decimalPart = possibleDecimals.slice(0, 2);
      }
    }

    integerPart = integerPart.replace(/\D/g, '') || '0';
    decimalPart = decimalPart.replace(/\D/g, '').padEnd(2, '0').slice(0, 2);
    return `${negative ? '-' : ''}${integerPart}.${decimalPart || '00'}`;
  }

  function toCents(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') {
      return Math.round(assertFiniteNumber(value, 'valor') * 100);
    }
    if (typeof value === 'bigint') {
      const cents = value * 100n;
      const number = Number(cents);
      if (!Number.isSafeInteger(number)) {
        throw new RangeError('valor excede o intervalo monetário seguro.');
      }
      return number;
    }

    const normalized = normalizeMoneyString(value);
    const amount = Number(normalized);
    if (!Number.isFinite(amount)) {
      throw new TypeError('valor monetário inválido.');
    }
    return Math.round(amount * 100);
  }

  function formatCents(value) {
    const cents = assertCents(value, 'centavos');
    const negative = cents < 0 ? '-' : '';
    const absolute = Math.abs(cents);
    const integer = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimals = String(absolute % 100).padStart(2, '0');
    return `${negative}${integer},${decimals}`;
  }

  function calculateDiscrimination(input) {
    const data = input || {};
    const quantity = Math.max(0, assertFiniteNumber(data.quantity == null ? 0 : data.quantity, 'quantidade'));
    const unitValueCents = assertCents(data.unitValueCents, 'valor unitário');
    const fixedDiscountCents = Math.max(0, assertCents(data.fixedDiscountCents, 'desconto fixo'));
    const discountPercent = Math.min(
      100,
      Math.max(0, assertFiniteNumber(data.discountPercent == null ? 0 : data.discountPercent, 'desconto percentual'))
    );
    const subtotalCents = Math.round(quantity * unitValueCents);
    const percentageDiscountCents = Math.round(subtotalCents * discountPercent / 100);
    const totalCents = Math.max(0, subtotalCents - fixedDiscountCents - percentageDiscountCents);

    return {
      subtotalCents,
      fixedDiscountCents,
      percentageDiscountCents,
      totalCents,
    };
  }

  function calculatePdv(payments, customerCount) {
    const values = payments || {};
    const totalCents = Object.keys(values).reduce(function (total, key) {
      return total + assertCents(values[key], `pagamento ${key}`);
    }, 0);
    const customers = Math.max(0, Math.trunc(assertFiniteNumber(customerCount == null ? 0 : customerCount, 'número de clientes')));

    return {
      totalCents,
      customerCount: customers,
      averageTicketCents: customers > 0 ? Math.round(totalCents / customers) : 0,
    };
  }

  function calculateCardNet(initialCents, finalCents) {
    return assertCents(finalCents, 'valor final') - assertCents(initialCents, 'valor inicial');
  }

  function calculateCardNets(cards) {
    const values = cards || {};
    const nets = {};
    let totalCents = 0;

    Object.keys(values).forEach(function (type) {
      const card = values[type] || {};
      const net = calculateCardNet(card.initialCents, card.finalCents);
      nets[type] = net;
      totalCents += net;
    });

    return { nets, totalCents };
  }

  function calculatePhysicalClosing(input) {
    const data = input || {};
    const pdvCashCents = assertCents(data.pdvCashCents, 'dinheiro do PDV');
    const entriesCents = assertCents(data.entriesCents, 'entradas');
    const cashDropsCents = assertCents(data.cashDropsCents, 'sangrias');
    const expensesCents = assertCents(data.expensesCents, 'despesas');
    const merchandiseCents = assertCents(data.merchandiseCents, 'mercadorias');
    const withdrawalsCents = assertCents(data.withdrawalsCents, 'retiradas');
    const countedCents = assertCents(data.countedCents, 'valor contado');

    const expectedCents = pdvCashCents
      + entriesCents
      - cashDropsCents
      - expensesCents
      - merchandiseCents
      - withdrawalsCents;

    return {
      expectedCents,
      countedCents,
      differenceCents: countedCents - expectedCents,
    };
  }

  return Object.freeze({
    parse: toCents,
    toCents,
    formatCents,
    calculateDiscrimination,
    calculatePdv,
    calculateCardNet,
    calculateCardNets,
    calculatePhysicalClosing,
  });
});
