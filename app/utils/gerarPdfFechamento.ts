/**
 * Gera o PDF do Relatório Final de um fechamento — 100% client-side (jsPDF), sem passar por
 * nenhum servidor: cabe no modelo do app (Nuxt SPA/Vercel, sem processo permanente). Os valores
 * já vêm calculados de `useRelatorioCalculado` (mesma fonte usada por SecaoRelatorioFinal.vue e
 * fechamentos/[id]/ver.vue) — este arquivo só faz o layout, não recalcula nada.
 */
import { jsPDF } from 'jspdf';
import type { FechamentoDraft, MotivoVendaCanceladaDraft } from '~/types/fechamento';
import type { VendaProdutoDia } from '~/composables/useVendasProdutoDia';
import { calculateDiscrimination, formatCents } from '~/utils/financeiro';
import type { RelatorioFinalResult } from '~/utils/financeiro';

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
  // Vendas por categoria (pedido do usuário, 25/09/2026: PDF completo com tudo que já aparece na
  // tela) — mesma quebra em 9 categorias de SecaoRelatorioFinal.vue (5 formas de pagamento do PDV
  // + 4 ajustes automáticos do CREARE).
  vendasPorCategoria: { rotulo: string; valorCents: number }[];
  // Detalhe linha a linha do "Esperado na gaveta" — mesma conta de calculatePhysicalClosing,
  // só explicada (ver detalhesEsperado em SecaoRelatorioFinal.vue).
  detalhesEsperado: { rotulo: string; sinal: '+' | '−'; valorCents: number }[];
  // Produtos vendidos no dia (tipo='F') e cancelados (tipo='C', com o motivo por item) — loja
  // inteira, mesma limitação de sempre (a tabela não liga produto a caixa/turno). Podem vir
  // vazios se o usuário nunca abriu esses painéis na tela (o PDF busca antes de gerar, ver
  // SecaoRelatorioFinal.vue#baixarPdf).
  produtos: VendaProdutoDia[];
  produtosCancelados: (VendaProdutoDia & { motivo: MotivoVendaCanceladaDraft | undefined })[];
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

function formatarQtd(qtd: number): string {
  return qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
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
        `R$ ${formatCents(l.valorCents + l.valorAcrescimoCents)}`,
      );
      // Discriminação (pedido do usuário, 25/09/2026: "todos os produtos") — itens detalhados
      // desse lançamento específico (ligados por lancamentoId, ver types/fechamento.ts).
      const itens = draft.discriminacoes.filter((d) => d.lancamentoId === l.id);
      for (const item of itens) {
        const { totalCents } = calculateDiscrimination({
          quantity: item.qtd,
          unitValueCents: item.valUnitCents,
          fixedDiscountCents: item.descontoValCents,
          discountPercent: item.descontoPct,
        });
        pdf.linha(
          `  ${item.produto || 'Sem nome'} (qtd. ${item.qtd})`,
          `R$ ${formatCents(totalCents)}`,
        );
      }
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
  pdf.linha('Vendas (PDV + Entradas)', `R$ ${formatCents(relatorio.valorTotalFinalCents)}`, {
    negrito: true,
  });
  for (const cat of dados.vendasPorCategoria) {
    pdf.linha(`  ${cat.rotulo}`, `R$ ${formatCents(cat.valorCents)}`);
  }
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

  // Transferência Final (pedido do usuário, 25/09/2026) — só existe depois de confirmada no
  // wizard (ver SecaoRelatorioFinal.vue); um fechamento salvo sem confirmar não deveria existir
  // (o "Salvar" fica bloqueado até lá), mas o PDF não assume isso, só reflete o estado real.
  if (draft.dinheiroContadoConfirmado) {
    pdf.secao('Transferência Final');
    pdf.linha('N° Lacre final', draft.lacreFechamento || '—');
    pdf.linha('Valor em Notas', `R$ ${formatCents(draft.dinheiroContadoNotasCents)}`);
    pdf.linha('Valor em Moedas', `R$ ${formatCents(draft.dinheiroContadoMoedasCents)}`);
    pdf.linha('Contado na gaveta', `R$ ${formatCents(fisico.countedCents)}`, { negrito: true });
    pdf.espaco(4);
    pdf.linha('Esperado na gaveta', `R$ ${formatCents(fisico.expectedCents)}`, { negrito: true });
    for (const item of dados.detalhesEsperado) {
      pdf.linha(`  ${item.sinal} ${item.rotulo}`, `R$ ${formatCents(item.valorCents)}`);
    }
    pdf.espaco(4);
    const corDiferencaFinal: [number, number, number] | undefined =
      fisico.differenceCents === 0
        ? undefined
        : fisico.differenceCents > 0
          ? [22, 163, 74]
          : [220, 38, 38];
    pdf.linha('Diferença (contado − esperado)', `R$ ${formatCents(fisico.differenceCents)}`, {
      negrito: true,
      corValor: corDiferencaFinal,
    });
  }

  pdf.secao(`Produtos vendidos no dia (${dados.produtos.length})`);
  pdf.vazio(
    'Loja inteira — não separado por caixa (a origem dos dados não liga produto a caixa/turno).',
  );
  if (dados.produtos.length === 0) {
    pdf.vazio('Nenhum produto sincronizado para esta data.');
  } else {
    for (const p of dados.produtos) {
      pdf.linha(
        `${p.produto} (qtd. ${formatarQtd(p.quantidade)})`,
        `R$ ${formatCents(p.totalCents)}`,
      );
      if (p.vendaCreareId) pdf.vazio(`Venda CREARE: ${p.vendaCreareId}`);
      if (p.formaPagamento) pdf.vazio(`Forma de pagamento: ${p.formaPagamento}`);
    }
  }

  pdf.secao(`Vendas/Produtos Cancelados (${dados.produtosCancelados.length})`);
  if (dados.produtosCancelados.length === 0) {
    pdf.vazio('Nenhum item cancelado sincronizado para esta data.');
  } else {
    for (const item of dados.produtosCancelados) {
      const hora = item.horaVenda ? item.horaVenda.slice(0, 5) : 'Horário não informado';
      const explicacao = item.motivo?.texto?.trim()
        ? item.motivo.texto.trim()
        : item.motivo?.tipo === 'audio' && item.motivo.audioPath
          ? 'Áudio registrado (transcrição não disponível)'
          : 'Nenhum motivo informado';
      pdf.linha(
        `${item.produto} — ${hora} (qtd. ${formatarQtd(item.quantidade)})`,
        `R$ ${formatCents(item.totalCents)}`,
      );
      pdf.vazio(`  Motivo: ${explicacao}`);
    }
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
