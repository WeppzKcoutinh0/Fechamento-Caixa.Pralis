import { describe, expect, it } from 'vitest';
import { criarFechamentoVazio } from '~/types/fechamento';
import { calculatePhysicalClosing, calculateRelatorioFinal } from '~/utils/financeiro';
import {
  gerarPdfFechamento,
  nomeArquivoPdf,
  type DadosRelatorioParaPdf,
} from './gerarPdfFechamento';

/** Junta o conteúdo bruto (stream PDF) de todas as páginas — o texto desenhado via `doc.text()`
 * aparece literalmente como `(texto) Tj` nesse stream, dá pra usar `.toContain()` de verdade em
 * vez de só checar "gerou bytes/não lançou erro" (jsPDF não expõe um "getText()" pronto). */
function textoDoPdf(doc: ReturnType<typeof gerarPdfFechamento>): string {
  const pages = doc.internal.pages as unknown[];
  return pages
    .slice(1)
    .map((p) => (Array.isArray(p) ? p.join('\n') : String(p)))
    .join('\n');
}

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
    vendasPorCategoria: [],
    detalhesEsperado: [],
    produtos: [],
    produtosCancelados: [],
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

  it('inclui a discriminação (itens detalhados) de cada lançamento', () => {
    const draft = criarFechamentoVazio();
    draft.lancamentos.push({
      id: 'l-1',
      tipo: 'mercadoria',
      status: 'pago',
      dataRef: '2026-09-25',
      dataNfe: '',
      nNfe: '',
      fornecedor: 'Distribuidora X',
      tipoMer: 'computado',
      valorCents: 5000,
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
    draft.discriminacoes.push({
      lancamentoId: 'l-1',
      tipo: 'mercadoria',
      qtd: 2,
      produto: 'Farinha de trigo',
      grupo: 'materia_prima',
      valUnitCents: 2500,
      descontoValCents: 0,
      descontoPct: 0,
    });
    const doc = gerarPdfFechamento(draft, dadosVazios());
    const texto = textoDoPdf(doc);
    expect(texto).toContain('Distribuidora X');
    expect(texto).toContain('Farinha de trigo');
    // 2 x R$25,00 = R$50,00 (calculateDiscrimination, sem desconto).
    expect(texto).toContain('50,00');
  });

  it('só mostra a seção "Transferência Final" quando dinheiroContadoConfirmado é true', () => {
    const draftNaoConfirmado = criarFechamentoVazio();
    draftNaoConfirmado.dinheiroContadoCents = 1000;
    draftNaoConfirmado.lacreFechamento = '000999';
    const textoSemSecao = textoDoPdf(gerarPdfFechamento(draftNaoConfirmado, dadosVazios()));
    expect(textoSemSecao).not.toContain('Transferência Final');
    expect(textoSemSecao).not.toContain('000999');

    const draftConfirmado = criarFechamentoVazio();
    draftConfirmado.dinheiroContadoConfirmado = true;
    draftConfirmado.lacreFechamento = '000123';
    draftConfirmado.dinheiroContadoNotasCents = 15000;
    draftConfirmado.dinheiroContadoMoedasCents = 5000;
    const textoComSecao = textoDoPdf(gerarPdfFechamento(draftConfirmado, dadosVazios()));
    expect(textoComSecao).toContain('Transferência Final');
    expect(textoComSecao).toContain('000123');
    expect(textoComSecao).toContain('150,00');
  });

  it('lista produtos vendidos e cancelados (com motivo)', () => {
    const draft = criarFechamentoVazio();
    const dados = dadosVazios();
    dados.produtos = [
      {
        id: 'p-1',
        produto: 'Pão Francês',
        produtoCodigo: '001',
        quantidade: 12.5,
        valorUnitarioCents: 120,
        totalCents: 1500,
        horaVenda: null,
      },
    ];
    dados.produtosCancelados = [
      {
        id: 'c-1',
        produto: 'Coca-Cola 2L',
        produtoCodigo: null,
        quantidade: 1,
        valorUnitarioCents: 1575,
        totalCents: 1575,
        horaVenda: '13:34:27',
        motivo: { tipo: 'texto', texto: 'Cliente desistiu', audioPath: null },
      },
    ];
    const texto = textoDoPdf(gerarPdfFechamento(draft, dados));
    expect(texto).toContain('Pão Francês');
    expect(texto).toContain('Coca-Cola 2L');
    expect(texto).toContain('13:34');
    expect(texto).toContain('Cliente desistiu');
  });

  it('não lança erro e mostra textos padrão pra item cancelado sem motivo e sem hora de venda', () => {
    const draft = criarFechamentoVazio();
    const dados = dadosVazios();
    dados.produtosCancelados = [
      {
        id: 'c-2',
        produto: 'Bolo de Chocolate',
        produtoCodigo: null,
        quantidade: 1,
        valorUnitarioCents: 3000,
        totalCents: 3000,
        horaVenda: null,
        motivo: undefined,
      },
    ];
    expect(() => gerarPdfFechamento(draft, dados)).not.toThrow();
    const texto = textoDoPdf(gerarPdfFechamento(draft, dados));
    expect(texto).toContain('Bolo de Chocolate');
    expect(texto).toContain('Hor');
    expect(texto).toContain('Nenhum motivo informado');
  });

  it('mostra "Áudio registrado" quando o motivo é só áudio (sem transcrição em texto)', () => {
    const draft = criarFechamentoVazio();
    const dados = dadosVazios();
    dados.produtosCancelados = [
      {
        id: 'c-3',
        produto: 'Suco Natural',
        produtoCodigo: null,
        quantidade: 1,
        valorUnitarioCents: 800,
        totalCents: 800,
        horaVenda: '09:15:00',
        motivo: { tipo: 'audio', texto: '', audioPath: 'audios/c-3.webm' },
      },
    ];
    const texto = textoDoPdf(gerarPdfFechamento(draft, dados));
    expect(texto).toContain('Suco Natural');
    expect(texto).toContain('Áudio registrado');
  });
});
