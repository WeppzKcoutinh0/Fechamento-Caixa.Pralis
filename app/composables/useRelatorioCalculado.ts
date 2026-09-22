import { computed, type Ref, watch } from 'vue';
import type { FechamentoDraft } from '~/types/fechamento';
import { useTransferenciasRecebidas } from './useTransferenciasRecebidas';
import {
  calculateCardNet,
  calculateCrediarioTotais,
  calculateLancamentosPorTipo,
  calculatePdvEntradas,
  calculatePhysicalClosing,
  calculateRelatorioFinal,
} from '~/utils/financeiro';

/**
 * Todos os valores derivados do Relatório Final (Seção 6), calculados a partir do rascunho —
 * usado tanto na tela de edição (`SecaoRelatorioFinal.vue`) quanto na de visualização
 * (`fechamentos/[id]/ver.vue`), pra não ter a mesma fórmula implementada duas vezes.
 */
export function useRelatorioCalculado(draft: Ref<FechamentoDraft>) {
  const totalEntradaCents = computed(() =>
    draft.value.entradas.reduce((s, e) => s + e.valorCents, 0),
  );
  const totalSaidaCents = computed(() =>
    draft.value.sangrias.reduce((s, sa) => s + sa.valorCents, 0),
  );

  // Transferência entre caixas com confirmação automática (pedido do usuário, 21/09/2026): saída
  // = soma do que ESTE caixa registrou como origem (dinheiro que realmente saiu da gaveta dele);
  // entrada = o que outros caixas registraram tendo este como destino, buscado via RPC segura
  // (ver useTransferenciasRecebidas.ts — nunca confia num "meu caixa" vindo do cliente).
  const transferenciaSaidaCents = computed(() =>
    draft.value.transferenciasCaixa
      .filter((t) => t.caixaOrigem === draft.value.caixa)
      .reduce((s, t) => s + t.valorCents, 0),
  );
  const {
    recebidas: transferenciasRecebidas,
    totalCents: transferenciaEntradaCents,
    buscarPorData: buscarTransferenciasRecebidas,
  } = useTransferenciasRecebidas();
  watch(
    () => draft.value.data,
    (data) => {
      if (data) void buscarTransferenciasRecebidas(data);
    },
    { immediate: true },
  );

  const pdv = computed(() =>
    calculatePdvEntradas(
      draft.value.pdvEntradas.map((e) => ({
        nrClientes: e.nrClientes,
        dinheiroCents: e.dinheiroCents,
        creditoCents: e.creditoCents,
        debitoCents: e.debitoCents,
        pixCents: e.pixCents,
        voucherCents: e.voucherCents,
        crediarioCents: e.crediarioCents,
      })),
    ),
  );

  const liqCreditoCents = computed(() =>
    calculateCardNet(draft.value.creditoManhaCents, draft.value.creditoTardeCents),
  );
  const liqDebitoCents = computed(() =>
    calculateCardNet(draft.value.debitoManhaCents, draft.value.debitoTardeCents),
  );
  const liqPixCents = computed(() =>
    calculateCardNet(draft.value.pixManhaCents, draft.value.pixTardeCents),
  );
  const liqVoucherCents = computed(() =>
    calculateCardNet(draft.value.voucherManhaCents, draft.value.voucherTardeCents),
  );

  const crediarioTotais = computed(() =>
    calculateCrediarioTotais(
      draft.value.crediario.map((c) => ({ tipo: c.tipo, valorCents: c.valorCents })),
    ),
  );

  const lancamentosPorTipo = computed(() =>
    calculateLancamentosPorTipo(
      draft.value.lancamentos.map((l) => ({
        tipo: l.tipo,
        valorCents: l.valorCents,
        valorAcrescimoCents: l.valorAcrescimoCents,
      })),
    ),
  );

  const relatorio = computed(() =>
    calculateRelatorioFinal({
      totalEntradaCents: totalEntradaCents.value,
      totalSaidaCents: totalSaidaCents.value,
      despesasCents: lancamentosPorTipo.value.despesaCents,
      mercadoriaCents: lancamentosPorTipo.value.mercadoriaCents,
      retiradasCents: lancamentosPorTipo.value.retiradaCents,
      transferenciaSaidaCents: transferenciaSaidaCents.value,
      transferenciaEntradaCents: transferenciaEntradaCents.value,
      totalPdvCents: pdv.value.totalCents,
      liqCreditoCents: liqCreditoCents.value,
      liqDebitoCents: liqDebitoCents.value,
      liqPixCents: liqPixCents.value,
      liqVoucherCents: liqVoucherCents.value,
      totalCrediarioCents: crediarioTotais.value.totalCents,
      pdvCreditoCents: pdv.value.creditoCents,
      pdvDebitoCents: pdv.value.debitoCents,
      pdvPixCents: pdv.value.pixCents,
      pdvVoucherCents: pdv.value.voucherCents,
      pdvCrediarioCents: pdv.value.crediarioCents,
    }),
  );

  const fisico = computed(() =>
    calculatePhysicalClosing({
      pdvCashCents: pdv.value.dinheiroCents,
      entriesCents: totalEntradaCents.value,
      cashDropsCents: totalSaidaCents.value,
      expensesCents: lancamentosPorTipo.value.despesaCents,
      merchandiseCents: lancamentosPorTipo.value.mercadoriaCents,
      withdrawalsCents: lancamentosPorTipo.value.retiradaCents,
      transferOutCents: transferenciaSaidaCents.value,
      transferInCents: transferenciaEntradaCents.value,
      countedCents: draft.value.dinheiroContadoCents,
    }),
  );

  return {
    totalEntradaCents,
    totalSaidaCents,
    pdv,
    liqCreditoCents,
    liqDebitoCents,
    liqPixCents,
    liqVoucherCents,
    crediarioTotais,
    lancamentosPorTipo,
    transferenciaSaidaCents,
    transferenciaEntradaCents,
    transferenciasRecebidas,
    relatorio,
    fisico,
  };
}
