import { describe, expect, it } from 'vitest';
import { criarFechamentoVazio } from '~/types/fechamento';
import { calculatePhysicalClosing, calculateRelatorioFinal } from '~/utils/financeiro';
import { gerarPdfFechamento, nomeArquivoPdf, type DadosRelatorioParaPdf } from './gerarPdfFechamento';

function dadosVazios(): DadosRelatorioParaPdf {
  const relatorio = calculateRelatorioFinal({
    totalEntradaCents: 0,
    totalSaidaCents: 0,
    despesasCents: 0,
    mercadoriaCents: 0,
    retiradasCents: 0,
    transferenciaSaidaCents: 0,
    transferenciaEntradaCents: 0,
    totalPdvCents: 0,
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
  const fisico = calculatePhysicalClosing({
    pdvCashCents: 0,
    entriesCents: 0,
    cashDropsCents: 0,
    expensesCents: 0,
    merchandiseCents: 0,
    withdrawalsCents: 0,
    transferOutCents: 0,
    transferInCents: 0,
    countedCents: 0,
  });
  return {
    totalEntradaCents: 0,
    totalSaidaCents: 0,
    pdvTotalCents: 0,
    pdvCreditoCents: 0,
    pdvDebitoCents: 0,
    pdvPixCents: 0,
    pdvVoucherCents: 0,
    pdvCrediarioCents: 0,
    liqCreditoCents: 0,
    liqDebitoCents: 0,
    liqPixCents: 0,
    liqVoucherCents: 0,
    crediarioTotalCents: 0,
    despesasCents: 0,
    mercadoriasCents: 0,
    retiradasCents: 0,
    relatorio,
    fisico,
  };
}

describe('gerarPdfFechamento', () => {
  it('gera um PDF válido (com bytes) pra um fechamento vazio', () => {
    const draft = criarFechamentoVazio();
    const doc = gerarPdfFechamento(draft, dadosVazios());
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('quebra pra mais páginas quando há muitos lançamentos', () => {
    const draft = criarFechamentoVazio();
    for (let i = 0; i < 120; i += 1) {
      draft.lancamentos.push({
        id: `l-${i}`,
        tipo: 'despesa',
        status: 'pago',
        dataRef: '2026-09-15',
        dataNfe: '',
        nNfe: '',
        fornecedor: `Fornecedor ${i}`,
        tipoMer: '',
        valorCents: 1000,
        valorAcrescimoCents: 0,
        tipoCredor: 'fornecedor',
        obsTipo: '',
        obsTexto: '',
        obsAudioPath: null,
        fotoPath: null,
        vencimento: '',
        dataPagamento: '',
        fotoNotaPath: null,
        origemAjusteCreare: '',
      });
    }
    const doc = gerarPdfFechamento(draft, dadosVazios());
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('lista PDVs (mais de um por fechamento) sem lançar erro', () => {
    const draft = criarFechamentoVazio();
    draft.pdvEntradas.push(
      {
        id: 'pdv-1',
        nrClientes: 10,
        dinheiroCents: 1000,
        creditoCents: 2000,
        debitoCents: 0,
        pixCents: 0,
        voucherCents: 0,
        crediarioCents: 0,
      },
      {
        id: 'pdv-2',
        nrClientes: 5,
        dinheiroCents: 500,
        creditoCents: 0,
        debitoCents: 0,
        pixCents: 0,
        voucherCents: 0,
        crediarioCents: 0,
      },
    );
    const doc = gerarPdfFechamento(draft, dadosVazios());
    expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(0);
  });

  it('nomeArquivoPdf usa código e data do fechamento', () => {
    const draft = criarFechamentoVazio();
    draft.codigo = 'FC-TESTE';
    draft.data = '2026-09-15';
    expect(nomeArquivoPdf(draft)).toBe('Fechamento-FC-TESTE-2026-09-15.pdf');
  });
});
