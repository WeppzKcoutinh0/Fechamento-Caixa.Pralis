/**
 * Núcleo financeiro do Fechamento de Caixa.
 *
 * Porta `FECHAMENTOCAIXA/app-core.js` para TypeScript com validação Zod, e o expande para
 * cobrir todas as fórmulas descritas em `docs/CONTRATO-COMPORTAMENTO-ATUAL.md`. Nenhuma
 * fórmula foi alterada — cada função aqui corresponde 1:1 a uma função do `index.html` atual.
 * Tudo em centavos inteiros (nunca `float`) para eliminar erro de arredondamento.
 */
import { z } from 'zod';

const centsSchema = z.number().int().safe();

export type Cents = z.infer<typeof centsSchema>;

function assertCents(value: number, fieldName: string): Cents {
  const result = centsSchema.safeParse(value);
  if (!result.success) {
    throw new TypeError(`${fieldName} deve ser um inteiro seguro em centavos.`);
  }
  return result.data;
}

/** Converte string monetária BR ("1.234,56", "R$ 10,00", "(10,05)") ou number em centavos. */
export function toCents(value: string | number | bigint | null | undefined): Cents {
  if (value == null || value === '') return 0;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('valor deve ser um número finito.');
    }
    return Math.round(value * 100);
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

function normalizeMoneyString(value: string): string {
  let text = value.trim();
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

/** Formata centavos como string monetária BR ("1.234,56"). */
export function formatCents(value: number): string {
  const cents = assertCents(value, 'centavos');
  const negative = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const integer = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = String(absolute % 100).padStart(2, '0');
  return `${negative}${integer},${decimals}`;
}

/** Converte centavos para string decimal ("1234.56") — formato que o Postgres `numeric` espera. */
export function centsToDecimalString(value: number): string {
  const cents = assertCents(value, 'centavos');
  const negative = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const integer = Math.floor(absolute / 100);
  const decimals = String(absolute % 100).padStart(2, '0');
  return `${negative}${integer}.${decimals}`;
}

// ─── Seção 2 — Transferências (calcTotalEntrada / calcTotalSangria) ─────────

export const itemComValorSchema = z.object({ valorCents: centsSchema });
export type ItemComValor = z.infer<typeof itemComValorSchema>;

/** Soma o valor de uma lista de entradas ou sangrias (mesma fórmula para ambas). */
export function sumValores(itens: ItemComValor[]): Cents {
  return itens.reduce((total, item) => total + assertCents(item.valorCents, 'valor'), 0);
}

// ─── Seção 4 — PDV (calcPDV) ─────────────────────────────────────────────────

export interface PdvEntradaInput {
  nrClientes: number;
  dinheiroCents: number;
  creditoCents: number;
  debitoCents: number;
  pixCents: number;
  voucherCents: number;
  crediarioCents: number;
}

/**
 * Soma uma LISTA de PDVs (um fechamento pode ter mais de um caixa/máquina reportando vendas no
 * mesmo dia — ver `types/fechamento.ts` PdvEntradaDraft). Expõe também os totais por forma de
 * pagamento (não só o grande total) porque `calculateRelatorioFinal` precisa deles separados pra
 * comparar com o líquido das maquininhas.
 */
export function calculatePdvEntradas(entradas: PdvEntradaInput[]): {
  totalCents: Cents;
  customerCount: number;
  averageTicketCents: Cents;
  dinheiroCents: Cents;
  creditoCents: Cents;
  debitoCents: Cents;
  pixCents: Cents;
  voucherCents: Cents;
  crediarioCents: Cents;
} {
  let dinheiroCents = 0;
  let creditoCents = 0;
  let debitoCents = 0;
  let pixCents = 0;
  let voucherCents = 0;
  let crediarioCents = 0;
  let customerCount = 0;

  for (const entrada of entradas) {
    dinheiroCents += assertCents(entrada.dinheiroCents, 'dinheiro do PDV');
    creditoCents += assertCents(entrada.creditoCents, 'crédito do PDV');
    debitoCents += assertCents(entrada.debitoCents, 'débito do PDV');
    pixCents += assertCents(entrada.pixCents, 'pix do PDV');
    voucherCents += assertCents(entrada.voucherCents, 'voucher do PDV');
    crediarioCents += assertCents(entrada.crediarioCents, 'crediário do PDV');
    customerCount += Math.max(0, Math.trunc(entrada.nrClientes ?? 0));
  }

  const totalCents =
    dinheiroCents + creditoCents + debitoCents + pixCents + voucherCents + crediarioCents;

  return {
    totalCents,
    customerCount,
    averageTicketCents: customerCount > 0 ? Math.round(totalCents / customerCount) : 0,
    dinheiroCents,
    creditoCents,
    debitoCents,
    pixCents,
    voucherCents,
    crediarioCents,
  };
}

// ─── Seção 4 — Maquininhas (calcCartoes) ─────────────────────────────────────

/** Líquido de uma bandeira = valor da tarde menos valor da manhã. */
export function calculateCardNet(initialCents: number, finalCents: number): Cents {
  return assertCents(finalCents, 'valor final') - assertCents(initialCents, 'valor inicial');
}

export function calculateCardNets(
  cards: Record<string, { initialCents: number; finalCents: number }>,
): {
  nets: Record<string, Cents>;
  totalCents: Cents;
} {
  const nets: Record<string, Cents> = {};
  let totalCents = 0;

  for (const type of Object.keys(cards)) {
    const card = cards[type]!;
    const net = calculateCardNet(card.initialCents, card.finalCents);
    nets[type] = net;
    totalCents += net;
  }

  return { nets, totalCents };
}

// ─── Seção 5 — Discriminação (calcDiscTotal) ─────────────────────────────────

export const discriminacaoInputSchema = z.object({
  quantity: z.number().default(0),
  unitValueCents: centsSchema,
  fixedDiscountCents: centsSchema.default(0),
  discountPercent: z.number().default(0),
});
export type DiscriminacaoInput = z.infer<typeof discriminacaoInputSchema>;

export function calculateDiscrimination(input: Partial<DiscriminacaoInput>): {
  subtotalCents: Cents;
  fixedDiscountCents: Cents;
  percentageDiscountCents: Cents;
  totalCents: Cents;
} {
  const data = discriminacaoInputSchema.parse(input);
  const quantity = Math.max(0, data.quantity);
  const fixedDiscountCents = Math.max(0, data.fixedDiscountCents);
  const discountPercent = Math.min(100, Math.max(0, data.discountPercent));

  const subtotalCents = Math.round(quantity * data.unitValueCents);
  const percentageDiscountCents = Math.round((subtotalCents * discountPercent) / 100);
  const totalCents = Math.max(0, subtotalCents - fixedDiscountCents - percentageDiscountCents);

  return { subtotalCents, fixedDiscountCents, percentageDiscountCents, totalCents };
}

// ─── Seção 3 — Lançamentos (recalcularLancamentos) ───────────────────────────

export const tipoLancamentoSchema = z.enum(['despesa', 'mercadoria', 'retirada']);
export type TipoLancamento = z.infer<typeof tipoLancamentoSchema>;

export const lancamentoParaTotalSchema = z.object({
  tipo: tipoLancamentoSchema,
  valorCents: centsSchema,
  // Opcional e com default 0: lançamento sem juros soma exatamente como antes desta extensão.
  valorAcrescimoCents: centsSchema.default(0),
});
export type LancamentoParaTotal = z.infer<typeof lancamentoParaTotalSchema>;

/** Valor + juros — o "Valor Total" que o modal de lançamento mostra (e o que entra no relatório). */
export function calculateValorTotalLancamento(
  valorCents: number,
  valorAcrescimoCents: number,
): Cents {
  return (
    assertCents(valorCents, 'valor do lançamento') +
    assertCents(valorAcrescimoCents, 'juros do lançamento')
  );
}

export function calculateLancamentosPorTipo(lancamentos: LancamentoParaTotal[]): {
  despesaCents: Cents;
  mercadoriaCents: Cents;
  retiradaCents: Cents;
  totalCents: Cents;
} {
  const totals = { despesaCents: 0, mercadoriaCents: 0, retiradaCents: 0 };

  for (const lancamento of lancamentos) {
    const key = `${lancamento.tipo}Cents` as 'despesaCents' | 'mercadoriaCents' | 'retiradaCents';
    totals[key] += calculateValorTotalLancamento(
      lancamento.valorCents,
      lancamento.valorAcrescimoCents,
    );
  }

  return {
    ...totals,
    totalCents: totals.despesaCents + totals.mercadoriaCents + totals.retiradaCents,
  };
}

// ─── Seção 4 — Crediário (recalcularCrediario) ───────────────────────────────

export const tipoCrediarioSchema = z.enum(['cliente', 'colaborador']);
export type TipoCrediario = z.infer<typeof tipoCrediarioSchema>;

export const crediarioItemParaTotalSchema = z.object({
  tipo: tipoCrediarioSchema,
  valorCents: centsSchema,
});
export type CrediarioItemParaTotal = z.infer<typeof crediarioItemParaTotalSchema>;

export function calculateCrediarioTotais(itens: CrediarioItemParaTotal[]): {
  clientesCents: Cents;
  colaboradoresCents: Cents;
  totalCents: Cents;
} {
  let clientesCents = 0;
  let colaboradoresCents = 0;

  for (const item of itens) {
    if (item.tipo === 'cliente')
      clientesCents += assertCents(item.valorCents, 'valor do crediário');
    else colaboradoresCents += assertCents(item.valorCents, 'valor do crediário');
  }

  return { clientesCents, colaboradoresCents, totalCents: clientesCents + colaboradoresCents };
}

// ─── Seção 6 — Relatório Final (calcRelatorioFinal) ──────────────────────────

export const relatorioFinalInputSchema = z.object({
  totalEntradaCents: centsSchema,
  totalSaidaCents: centsSchema, // == total das sangrias (campo redundante preservado, ver contrato)
  despesasCents: centsSchema,
  mercadoriaCents: centsSchema,
  retiradasCents: centsSchema,
  // Transferência entre caixas COM confirmação automática do lado de quem recebe (pedido do
  // usuário, 21/09/2026) — sai da Diferença de quem é origem (como uma sangria), entra na de quem
  // é destino (como uma entrada). `.default(0)`: nem todo fechamento tem transferência, e nem
  // toda tela que já chama esta função precisa saber disso.
  transferenciaSaidaCents: centsSchema.default(0),
  transferenciaEntradaCents: centsSchema.default(0),
  totalPdvCents: centsSchema,
  liqCreditoCents: centsSchema,
  liqDebitoCents: centsSchema,
  liqPixCents: centsSchema,
  liqVoucherCents: centsSchema,
  totalCrediarioCents: centsSchema,
  pdvCreditoCents: centsSchema,
  pdvDebitoCents: centsSchema,
  pdvPixCents: centsSchema,
  pdvVoucherCents: centsSchema,
  pdvCrediarioCents: centsSchema,
});
export type RelatorioFinalInput = z.infer<typeof relatorioFinalInputSchema>;

export type DiferencaStatus = 'zero' | 'sobra' | 'falta';

export interface RelatorioFinalResult {
  totalSaidasCents: Cents;
  cartoesCents: Cents;
  valorTotalFinalCents: Cents;
  diferencaCents: Cents;
  relPdvDiferencaCents: Cents;
  diffCreditoCents: Cents;
  diffDebitoCents: Cents;
  diffPixCents: Cents;
  diffVoucherCents: Cents;
  diffCrediarioCents: Cents;
  status: DiferencaStatus;
}

/**
 * Fórmula principal do fechamento — idêntica a `calcRelatorioFinal` no `index.html` atual.
 * `totalSaidaCents` já É a sangria (ver `sumValores`/contrato): não somar sangria de novo aqui.
 */
export function calculateRelatorioFinal(input: RelatorioFinalInput): RelatorioFinalResult {
  const data = relatorioFinalInputSchema.parse(input);

  const totalSaidasCents =
    data.totalSaidaCents +
    data.despesasCents +
    data.mercadoriaCents +
    data.retiradasCents +
    data.transferenciaSaidaCents;
  const cartoesCents =
    data.liqCreditoCents + data.liqDebitoCents + data.liqPixCents + data.liqVoucherCents;
  const valorTotalFinalCents =
    data.totalPdvCents + data.totalEntradaCents + data.transferenciaEntradaCents;
  const diferencaCents =
    valorTotalFinalCents - totalSaidasCents - cartoesCents - data.totalCrediarioCents;
  const relPdvDiferencaCents = data.totalPdvCents - (totalSaidasCents - data.totalEntradaCents);

  const status: DiferencaStatus =
    diferencaCents === 0 ? 'zero' : diferencaCents > 0 ? 'sobra' : 'falta';

  return {
    totalSaidasCents,
    cartoesCents,
    valorTotalFinalCents,
    diferencaCents,
    relPdvDiferencaCents,
    diffCreditoCents: data.liqCreditoCents - data.pdvCreditoCents,
    diffDebitoCents: data.liqDebitoCents - data.pdvDebitoCents,
    diffPixCents: data.liqPixCents - data.pdvPixCents,
    diffVoucherCents: data.liqVoucherCents - data.pdvVoucherCents,
    diffCrediarioCents: data.totalCrediarioCents - data.pdvCrediarioCents,
    status,
  };
}

// ─── Card aditivo "esperado × contado" (decisão do plano — não substitui `diferencaCents`) ──

export const physicalClosingInputSchema = z.object({
  pdvCashCents: centsSchema,
  entriesCents: centsSchema,
  cashDropsCents: centsSchema,
  expensesCents: centsSchema,
  merchandiseCents: centsSchema,
  withdrawalsCents: centsSchema,
  transferOutCents: centsSchema.default(0),
  transferInCents: centsSchema.default(0),
  countedCents: centsSchema,
});
export type PhysicalClosingInput = z.infer<typeof physicalClosingInputSchema>;

export function calculatePhysicalClosing(input: PhysicalClosingInput): {
  expectedCents: Cents;
  countedCents: Cents;
  differenceCents: Cents;
} {
  const data = physicalClosingInputSchema.parse(input);

  const expectedCents =
    data.pdvCashCents +
    data.entriesCents +
    data.transferInCents -
    data.cashDropsCents -
    data.expensesCents -
    data.merchandiseCents -
    data.withdrawalsCents -
    data.transferOutCents;

  return {
    expectedCents,
    countedCents: data.countedCents,
    differenceCents: data.countedCents - expectedCents,
  };
}
