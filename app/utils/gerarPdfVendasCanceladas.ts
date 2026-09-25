/**
 * Exporta SÓ a parte de Vendas/Produtos Cancelados do Relatório Final — pedido do usuário
 * (23/09/2026): documentar o motivo (texto ou áudio transcrito manualmente) e os itens cancelados
 * separado do PDF do fechamento inteiro. Mesmo estilo de PDF de gerarPdfFechamento.ts (reusa
 * ConstrutorPdf), só que com um conteúdo bem mais enxuto.
 */
import type { FechamentoDraft } from '~/types/fechamento';
import type { VendaCancelada } from '~/composables/useVendasCanceladas';
import { formatCents } from '~/utils/financeiro';
import { formatarDataBr } from '~/utils/vendasFechamento';
import { ConstrutorPdf } from '~/utils/gerarPdfFechamento';

export function gerarPdfVendasCanceladas(draft: FechamentoDraft, itens: VendaCancelada[]) {
  const pdf = new ConstrutorPdf();

  pdf.titulo('Vendas/Produtos Cancelados');
  pdf.subtitulo(`Responsável: ${draft.responsavel || 'Não informado'}`);
  pdf.subtitulo(`Data: ${formatarDataBr(draft.data)}`);
  pdf.subtitulo(
    `Caixa: ${draft.caixa || 'Não informado'} — Turno: ${draft.turno || 'Não informado'} — Código: ${draft.codigo}`,
  );

  pdf.secao(`Itens cancelados (${itens.length})`);
  if (itens.length === 0) {
    pdf.vazio(`Nenhum item cancelado sincronizado para ${formatarDataBr(draft.data)}.`);
  } else {
    for (const item of itens) {
      const motivo = draft.vendasCanceladasMotivos[item.id];
      const hora = item.horaVenda ? item.horaVenda.slice(0, 5) : 'Horário não informado';
      const explicacao = motivo?.texto?.trim()
        ? motivo.texto.trim()
        : motivo?.tipo === 'audio' && motivo.audioPath
          ? 'Áudio registrado (transcrição não disponível)'
          : 'Nenhum motivo informado';
      pdf.linha(
        `${item.produto} — ${hora} (qtd. ${item.quantidade})`,
        `R$ ${formatCents(item.totalCents)}`,
      );
      pdf.vazio(`Motivo: ${explicacao}`);
    }
  }

  return pdf.doc;
}

export function nomeArquivoPdfVendasCanceladas(draft: FechamentoDraft): string {
  return `Vendas-Canceladas-${draft.codigo}-${draft.data}.pdf`;
}

export function baixarPdfVendasCanceladas(draft: FechamentoDraft, itens: VendaCancelada[]): void {
  const doc = gerarPdfVendasCanceladas(draft, itens);
  doc.save(nomeArquivoPdfVendasCanceladas(draft));
}
