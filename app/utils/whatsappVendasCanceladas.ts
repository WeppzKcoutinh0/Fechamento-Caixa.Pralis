/**
 * Envio por WhatsApp só da parte de Vendas/Produtos Cancelados — pedido do usuário (23/09/2026).
 * Sem número fixo de destino (não existe integração de API do WhatsApp no app, ver investigação
 * desta feature): abre `wa.me` com o texto pronto, e a pessoa escolhe o contato na hora, igual a
 * um compartilhamento manual comum.
 */
import type { FechamentoDraft } from '~/types/fechamento';
import type { VendaCancelada } from '~/composables/useVendasCanceladas';
import { formatCents } from '~/utils/financeiro';
import { formatarDataBr } from '~/utils/vendasFechamento';

export function textoWhatsappVendasCanceladas(
  draft: FechamentoDraft,
  itens: VendaCancelada[],
): string {
  const linhas = [
    `*Vendas/Produtos Cancelados*`,
    `*Responsável:* ${draft.responsavel || 'Não informado'}`,
    `*Data:* ${formatarDataBr(draft.data)}`,
    `*Caixa:* ${draft.caixa || 'Não informado'} — *Turno:* ${draft.turno || 'Não informado'}`,
    '',
    `*Itens cancelados (${itens.length}):*`,
  ];
  if (itens.length === 0) {
    linhas.push('Nenhum item cancelado sincronizado para esta data.');
  } else {
    for (const item of itens) {
      const motivo = draft.vendasCanceladasMotivos[item.id];
      const hora = item.horaVenda ? item.horaVenda.slice(0, 5) : 'Horário não informado';
      const explicacao = motivo?.texto?.trim()
        ? motivo.texto.trim()
        : motivo?.tipo === 'audio' && motivo.audioPath
          ? 'Áudio registrado (transcrição não disponível)'
          : 'Nenhum motivo informado';
      linhas.push(`- *${item.produto}* — R$ ${formatCents(item.totalCents)} — ${hora}`);
      linhas.push(`  Motivo: ${explicacao}`);
    }
  }
  return linhas.join('\n');
}

export function abrirWhatsappVendasCanceladas(
  draft: FechamentoDraft,
  itens: VendaCancelada[],
): void {
  const texto = textoWhatsappVendasCanceladas(draft, itens);
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
}
