<script setup lang="ts">
import { toRef } from 'vue';
import type { FechamentoDraft } from '~/types/fechamento';
import CampoDinheiro from '~/components/comum/CampoDinheiro.vue';
import CartaoValor from '~/components/comum/CartaoValor.vue';
import CockpitCategorias from '~/components/fechamento/CockpitCategorias.vue';
import { useRelatorioCalculado } from '~/composables/useRelatorioCalculado';
import { formatCents } from '~/utils/financeiro';
import { baixarPdfFechamento } from '~/utils/gerarPdfFechamento';

const props = defineProps<{ draft: FechamentoDraft }>();

const {
  totalEntradaCents,
  totalSaidaCents,
  pdv,
  liqCreditoCents,
  liqDebitoCents,
  liqPixCents,
  liqVoucherCents,
  crediarioTotais,
  lancamentosPorTipo,
  relatorio,
  fisico,
} = useRelatorioCalculado(toRef(props, 'draft'));

// Geração 100% client-side (jsPDF) — reusa os mesmos valores já calculados acima, não recalcula
// nada por conta própria (ver utils/gerarPdfFechamento.ts).
function baixarPdf(): void {
  baixarPdfFechamento(props.draft, {
    totalEntradaCents: totalEntradaCents.value,
    totalSaidaCents: totalSaidaCents.value,
    pdvTotalCents: pdv.value.totalCents,
    pdvCreditoCents: pdv.value.creditoCents,
    pdvDebitoCents: pdv.value.debitoCents,
    pdvPixCents: pdv.value.pixCents,
    pdvVoucherCents: pdv.value.voucherCents,
    pdvCrediarioCents: pdv.value.crediarioCents,
    liqCreditoCents: liqCreditoCents.value,
    liqDebitoCents: liqDebitoCents.value,
    liqPixCents: liqPixCents.value,
    liqVoucherCents: liqVoucherCents.value,
    crediarioTotalCents: crediarioTotais.value.totalCents,
    despesasCents: lancamentosPorTipo.value.despesaCents,
    mercadoriasCents: lancamentosPorTipo.value.mercadoriaCents,
    retiradasCents: lancamentosPorTipo.value.retiradaCents,
    relatorio: relatorio.value,
    fisico: fisico.value,
  });
}

const STATUS_TEXTO = {
  zero: '✔ Caixa fechado sem diferença!',
  sobra: '↑ Sobra',
  falta: '↓ Falta',
};
const STATUS_COR = { zero: 'default', sobra: 'success', falta: 'error' } as const;

function classeDiff(cents: number): 'success' | 'error' | undefined {
  if (Math.abs(cents) < 1) return undefined;
  return cents > 0 ? 'success' : 'error';
}
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <v-btn
      color="primary"
      variant="tonal"
      prepend-icon="mdi-file-pdf-box"
      class="align-self-start"
      @click="baixarPdf"
    >
      Baixar PDF
    </v-btn>

    <v-card
      :color="STATUS_COR[relatorio.status]"
      :variant="relatorio.status === 'zero' ? 'outlined' : 'tonal'"
      class="pa-4"
      rounded="lg"
    >
      <div class="text-caption">Diferença Geral</div>
      <div class="text-h5">R$ {{ formatCents(Math.abs(relatorio.diferencaCents)) }}</div>
      <div class="text-body-2">
        {{ STATUS_TEXTO[relatorio.status]
        }}{{
          relatorio.status !== 'zero'
            ? ` de R$ ${formatCents(Math.abs(relatorio.diferencaCents))}`
            : ''
        }}
      </div>
    </v-card>

    <!-- Cockpit por categoria: mesma ideia (e as mesmas 6 cores) da planilha de fechamento do
         dono — Venda/Transferências/Despesas/Mercadorias/Retiradas/Diferença — e o mesmo padrão
         visual que o Sistema Inteligente Pralís já usa na tela de Caixa. -->
    <CockpitCategorias
      :venda-cents="relatorio.valorTotalFinalCents"
      :transferencias-entrada-cents="totalEntradaCents"
      :transferencias-saida-cents="totalSaidaCents"
      :despesas-cents="lancamentosPorTipo.despesaCents"
      :mercadorias-cents="lancamentosPorTipo.mercadoriaCents"
      :retiradas-cents="lancamentosPorTipo.retiradaCents"
      :resultado-cents="relatorio.diferencaCents"
    />

    <div class="grade-cartoes">
      <CartaoValor rotulo="Cartões" :valor="`R$ ${formatCents(relatorio.cartoesCents)}`" />
      <CartaoValor
        rotulo="Rel. PDV Diferença"
        :valor="`R$ ${formatCents(relatorio.relPdvDiferencaCents)}`"
      />
    </div>

    <v-divider />
    <div class="text-subtitle-2">Conferência por forma de pagamento</div>

    <v-card
      v-for="forma in ['Crédito', 'Débito', 'Pix', 'Voucher', 'Crediário'] as const"
      :key="forma"
      variant="outlined"
      class="pa-3"
      rounded="lg"
    >
      <div class="text-caption text-medium-emphasis mb-1">{{ forma }}</div>
      <div class="d-flex justify-space-between text-body-2">
        <span
          >Final: R$
          {{
            formatCents(
              forma === 'Crédito'
                ? liqCreditoCents
                : forma === 'Débito'
                  ? liqDebitoCents
                  : forma === 'Pix'
                    ? liqPixCents
                    : forma === 'Voucher'
                      ? liqVoucherCents
                      : crediarioTotais.totalCents,
            )
          }}</span
        >
        <span
          >PDV: R$
          {{
            formatCents(
              forma === 'Crédito'
                ? pdv.creditoCents
                : forma === 'Débito'
                  ? pdv.debitoCents
                  : forma === 'Pix'
                    ? pdv.pixCents
                    : forma === 'Voucher'
                      ? pdv.voucherCents
                      : pdv.crediarioCents,
            )
          }}</span
        >
      </div>
      <v-chip
        size="small"
        class="mt-1"
        :color="
          classeDiff(
            forma === 'Crédito'
              ? relatorio.diffCreditoCents
              : forma === 'Débito'
                ? relatorio.diffDebitoCents
                : forma === 'Pix'
                  ? relatorio.diffPixCents
                  : forma === 'Voucher'
                    ? relatorio.diffVoucherCents
                    : relatorio.diffCrediarioCents,
          )
        "
      >
        Diferença: R$
        {{
          formatCents(
            forma === 'Crédito'
              ? relatorio.diffCreditoCents
              : forma === 'Débito'
                ? relatorio.diffDebitoCents
                : forma === 'Pix'
                  ? relatorio.diffPixCents
                  : forma === 'Voucher'
                    ? relatorio.diffVoucherCents
                    : relatorio.diffCrediarioCents,
          )
        }}
      </v-chip>
    </v-card>

    <v-divider />
    <div class="text-subtitle-2">Dinheiro esperado × contado</div>
    <p class="text-caption text-medium-emphasis">
      Informativo — não altera a Diferença Geral acima. Esperado = dinheiro do PDV + entradas −
      sangrias − despesas − mercadorias − retiradas.
    </p>
    <div class="d-flex flex-column flex-sm-row ga-3">
      <CartaoValor
        rotulo="Dinheiro esperado na gaveta"
        :valor="`R$ ${formatCents(fisico.expectedCents)}`"
      />
      <CampoDinheiro v-model="draft.dinheiroContadoCents" label="Dinheiro contado na gaveta" />
    </div>
    <CartaoValor
      v-if="draft.dinheiroContadoCents"
      rotulo="Diferença (contado − esperado)"
      :valor="`R$ ${formatCents(fisico.differenceCents)}`"
      :tom="
        fisico.differenceCents === 0
          ? 'neutro'
          : fisico.differenceCents > 0
            ? 'positivo'
            : 'negativo'
      "
    />
  </div>
</template>
