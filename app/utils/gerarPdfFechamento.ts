/**
 * Gera o PDF do Relatório Final de um fechamento — 100% client-side (jsPDF), sem passar por
 * nenhum servidor: cabe no modelo do app (Nuxt SPA/Vercel, sem processo permanente). Os valores
 * já vêm calculados de `useRelatorioCalculado` (mesma fonte usada por SecaoRelatorioFinal.vue e
 * fechamentos/[id]/ver.vue) — este arquivo só faz o layout, não recalcula nada.
 */
import { jsPDF } from 'jspdf';
import type { FechamentoDraft } from '~/types/fechamento';
import type { RelatorioFinalResult } from '~/utils/financeiro';
import { formatCents } from '~/utils/financeiro';

export interface DadosRelatorioParaPdf {
  totalEntradaCents: number;
  totalSaidaCents: number;
  pdvTotalCents: number;
  pdvCreditoCents: number;
  pdvDebitoCents: number;
  pdvPixCents: number;
  pdvVoucherCents: number;
  pdvCrediarioCents: number;
  liqCreditoCents: number;
  liqDebitoCents: number;
  liqPixCents: number;
  liqVoucherCents: number;
  crediarioTotalCents: number;
  despesasCents: number;
  mercadoriasCents: number;
  retiradasCents: number;
  relatorio: RelatorioFinalResult;
  fisico: { expectedCents: number; countedCents: number; differenceCents: number };
}

const ROTULOS_TIPO: Record<string, string> = {
  despesa: 'Despesa',
  mercadoria: 'Mercadoria',
  retirada: 'Retirada',
};
const ROTULOS_STATUS: Record<string, string> = { pago: 'Pago', naopago: 'Não pago' };
const STATUS_TEXTO: Record<RelatorioFinalResult['status'], string> = {
  zero: 'Caixa fechado sem diferença',
  sobra: 'Sobra',
  falta: 'Falta',
};

function formatarDataBr(data: string): string {
  if (!data) return '—';
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}

const MARGEM_X = 40;
const LARGURA_PAGINA = 595.28; // A4 em pt
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM_X * 2;
const LIMITE_Y = 800;

/** Exportado pra outros geradores de PDF (ex.: gerarPdfVendasCanceladas.ts) reusarem o mesmo
 * layout/tipografia sem duplicar as primitivas — um único "estilo de PDF" no app inteiro. */
export class ConstrutorPdf {
  doc = new jsPDF({ unit: 'pt', format: 'a4' });
  y = 48;

  private quebraSeNecessario(alturaLinha: number): void {
    if (this.y + alturaLinha > LIMITE_Y) {
      this.doc.addPage();
      this.y = 48;
    }
  }

  titulo(texto: string): void {
    this.doc.setFontSize(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(texto, MARGEM_X, this.y);
    this.y += 22;
  }

  subtitulo(texto: string): void {
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(90, 90, 90);
    this.doc.text(texto, MARGEM_X, this.y);
    this.doc.setTextColor(0, 0, 0);
    this.y += 14;
  }

  secao(texto: string): void {
    this.quebraSeNecessario(28);
    this.y += 10;
    this.doc.setFillColor(237, 237, 240);
    this.doc.rect(MARGEM_X, this.y - 12, LARGURA_UTIL, 18, 'F');
    this.doc.setFontSize(10.5);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(texto, MARGEM_X + 6, this.y + 1);
    this.y += 18;
  }

  linha(
    label: string,
    valor: string,
    opts?: { negrito?: boolean; corValor?: [number, number, number] },
  ): void {
    this.quebraSeNecessario(14);
    this.doc.setFontSize(9.5);
    this.doc.setFont('helvetica', opts?.negrito ? 'bold' : 'normal');
    this.doc.setTextColor(40, 40, 40);
    this.doc.text(label, MARGEM_X + 4, this.y);
    if (opts?.corValor) this.doc.setTextColor(...opts.corValor);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(valor, MARGEM_X + LARGURA_UTIL - 4, this.y, { align: 'right' });
    this.doc.setTextColor(0, 0, 0);
    this.y += 13;
  }

  vazio(texto: string): void {
    this.quebraSeNecessario(13);
    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'italic');
    this.doc.setTextColor(120, 120, 120);
    this.doc.text(texto, MARGEM_X + 4, this.y);
    this.doc.setTextColor(0, 0, 0);
    this.y += 13;
  }

  espaco(altura = 6): void {
    this.y += altura;
  }
}

export function gerarPdfFechamento(draft: FechamentoDraft, dados: DadosRelatorioParaPdf): jsPDF {
  const pdf = new ConstrutorPdf();
  const { relatorio, fisico } = dados;

  pdf.titulo('Fechamento de Caixa');
  pdf.subtitulo(draft.codigo);
  pdf.subtitulo(
    `${formatarDataBr(draft.data)} — ${draft.caixa || '—'} / ${draft.turno || '—'} — Responsável: ${draft.responsavel || '—'}`,
  );

  pdf.secao(`Entradas — Total: R$ ${formatCents(dados.totalEntradaCents)}`);
  if (draft.entradas.length === 0) {
    pdf.vazio('Nenhuma entrada registrada.');
  } else {
    for (const e of draft.entradas) {
      pdf.linha(
        `${e.descricao || 'Sem descrição'}${e.lacre ? ` (lacre ${e.lacre})` : ''}`,
        `R$ ${formatCents(e.valorCents)}`,
      );
    }
  }

  pdf.secao(`Sangrias — Total: R$ ${formatCents(dados.totalSaidaCents)}`);
  if (draft.sangrias.length === 0) {
    pdf.vazio('Nenhuma sangria registrada.');
  } else {
    for (const s of draft.sangrias) {
      pdf.linha(
        `${s.descricao || 'Sem descrição'}${s.lacre ? ` (lacre ${s.lacre})` : ''}`,
        `R$ ${formatCents(s.valorCents)}`,
      );
    }
  }

  if (draft.transferenciasCaixa.length > 0) {
    pdf.secao('Transferência entre caixas (informativo)');
    for (const t of draft.transferenciasCaixa) {
      pdf.linha(
        `${t.caixaOrigem || '—'} → ${t.caixaDestino || '—'}${t.lacre ? ` (lacre ${t.lacre})` : ''}`,
        `R$ ${formatCents(t.valorCents)}`,
      );
    }
  }

  if (draft.lancamentos.length > 0) {
    pdf.secao('Lançamentos');
    for (const l of draft.lancamentos) {
      pdf.linha(
        `[${ROTULOS_TIPO[l.tipo]}] ${l.fornecedor || 'Sem descrição'} — ${ROTULOS_STATUS[l.status]}`,
        `R$ ${formatCents(l.valorCents)}`,
      );
    }
  }

  pdf.secao(`Relatório PDV — Total: R$ ${formatCents(dados.pdvTotalCents)}`);
  if (draft.pdvEntradas.length === 0) {
    pdf.vazio('Nenhum PDV registrado.');
  } else {
    draft.pdvEntradas.forEach((p, indice) => {
      const totalEntrada =
        p.dinheiroCents +
        p.creditoCents +
        p.debitoCents +
        p.pixCents +
        p.voucherCents +
        p.crediarioCents;
      pdf.linha(
        `PDV ${indice + 1} — ${p.nrClientes} cliente${p.nrClientes === 1 ? '' : 's'}`,
        `R$ ${formatCents(totalEntrada)}`,
        { negrito: true },
      );
      pdf.linha('  Dinheiro', `R$ ${formatCents(p.dinheiroCents)}`);
      pdf.linha('  Crédito', `R$ ${formatCents(p.creditoCents)}`);
      pdf.linha('  Débito', `R$ ${formatCents(p.debitoCents)}`);
      pdf.linha('  Pix', `R$ ${formatCents(p.pixCents)}`);
      pdf.linha('  Voucher', `R$ ${formatCents(p.voucherCents)}`);
      pdf.linha('  Crediário', `R$ ${formatCents(p.crediarioCents)}`);
    });
  }

  pdf.secao('Maquininhas (líquido)');
  pdf.linha('Crédito', `R$ ${formatCents(dados.liqCreditoCents)}`);
  pdf.linha('Débito', `R$ ${formatCents(dados.liqDebitoCents)}`);
  pdf.linha('Pix', `R$ ${formatCents(dados.liqPixCents)}`);
  pdf.linha('Voucher', `R$ ${formatCents(dados.liqVoucherCents)}`);

  if (draft.crediario.length > 0) {
    pdf.secao(`Crediário — Total: R$ ${formatCents(dados.crediarioTotalCents)}`);
    for (const c of draft.crediario) {
      pdf.linha(
        `${c.nome || '—'} (${c.tipo === 'cliente' ? 'cliente' : 'colaborador'})`,
        `R$ ${formatCents(c.valorCents)}`,
      );
    }
  }

  pdf.secao('Conferência por forma de pagamento');
  const formas: { nome: string; finalCents: number; pdvCents: number; diffCents: number }[] = [
    {
      nome: 'Crédito',
      finalCents: dados.liqCreditoCents,
      pdvCents: dados.pdvCreditoCents,
      diffCents: relatorio.diffCreditoCents,
    },
    {
      nome: 'Débito',
      finalCents: dados.liqDebitoCents,
      pdvCents: dados.pdvDebitoCents,
      diffCents: relatorio.diffDebitoCents,
    },
    {
      nome: 'Pix',
      finalCents: dados.liqPixCents,
      pdvCents: dados.pdvPixCents,
      diffCents: relatorio.diffPixCents,
    },
    {
      nome: 'Voucher',
      finalCents: dados.liqVoucherCents,
      pdvCents: dados.pdvVoucherCents,
      diffCents: relatorio.diffVoucherCents,
    },
    {
      nome: 'Crediário',
      finalCents: dados.crediarioTotalCents,
      pdvCents: dados.pdvCrediarioCents,
      diffCents: relatorio.diffCrediarioCents,
    },
  ];
  for (const f of formas) {
    pdf.linha(
      `${f.nome} — Final: R$ ${formatCents(f.finalCents)} / PDV: R$ ${formatCents(f.pdvCents)}`,
      `Dif.: R$ ${formatCents(f.diffCents)}`,
      {
        corValor:
          Math.abs(f.diffCents) < 1 ? undefined : f.diffCents > 0 ? [22, 163, 74] : [220, 38, 38],
      },
    );
  }

  pdf.secao('Resultado');
  pdf.linha('Vendas (PDV + Entradas)', `R$ ${formatCents(relatorio.valorTotalFinalCents)}`);
  pdf.linha('Despesas', `R$ ${formatCents(dados.despesasCents)}`);
  pdf.linha('Mercadorias', `R$ ${formatCents(dados.mercadoriasCents)}`);
  pdf.linha('Retiradas', `R$ ${formatCents(dados.retiradasCents)}`);
  pdf.linha('Cartões (líquido)', `R$ ${formatCents(relatorio.cartoesCents)}`);
  pdf.espaco(4);
  const corDiferenca: [number, number, number] | undefined =
    relatorio.status === 'zero'
      ? undefined
      : relatorio.status === 'sobra'
        ? [22, 163, 74]
        : [220, 38, 38];
  pdf.linha(
    `Diferença Geral — ${STATUS_TEXTO[relatorio.status]}`,
    `R$ ${formatCents(Math.abs(relatorio.diferencaCents))}`,
    { negrito: true, corValor: corDiferenca },
  );

  if (draft.dinheiroContadoCents) {
    pdf.secao('Dinheiro esperado × contado (informativo)');
    pdf.linha('Esperado na gaveta', `R$ ${formatCents(fisico.expectedCents)}`);
    pdf.linha('Contado na gaveta', `R$ ${formatCents(fisico.countedCents)}`);
    pdf.linha('Diferença (contado − esperado)', `R$ ${formatCents(fisico.differenceCents)}`);
  }

  return pdf.doc;
}

export function nomeArquivoPdf(draft: FechamentoDraft): string {
  return `Fechamento-${draft.codigo}-${draft.data}.pdf`;
}

export function baixarPdfFechamento(draft: FechamentoDraft, dados: DadosRelatorioParaPdf): void {
  const doc = gerarPdfFechamento(draft, dados);
  doc.save(nomeArquivoPdf(draft));
}
