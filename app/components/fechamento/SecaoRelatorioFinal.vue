<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import type { FechamentoDraft } from '~/types/fechamento';
import CampoDinheiro from '~/components/comum/CampoDinheiro.vue';
import CartaoValor from '~/components/comum/CartaoValor.vue';
import CockpitCategorias from '~/components/fechamento/CockpitCategorias.vue';
import { useRelatorioCalculado } from '~/composables/useRelatorioCalculado';
import { useVendasProdutoDia } from '~/composables/useVendasProdutoDia';
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

// "Vendas" expandido nas 9 categorias (pedido do usuário, 21/09/2026) — mesmas 9 do "Tipo de
// conta" da Entrada. As 5 formas de pagamento vêm do PDV (já calculado acima); as outras 4 vêm
// dos lançamentos automáticos que o CREARE já cria (ver aplicarAjustesComoLancamentos em
// utils/vendasFechamento.ts) — procurados pelo mesmo `origemAjusteCreare` que os identifica.
// Lista de PRODUTOS vendidos é uma coisa SEPARADA (não tem ligação com forma de pagamento nem
// caixa na origem — ver useVendasProdutoDia.ts) — fica ao lado, não dentro de cada categoria.
function valorPorAjuste(chave: string): number {
  return props.draft.lancamentos.find((l) => l.origemAjusteCreare === chave)?.valorCents ?? 0;
}
const vendasPorCategoria = computed(() => [
  { rotulo: 'CREDITO', valorCents: pdv.value.creditoCents },
  { rotulo: 'DEBITO', valorCents: pdv.value.debitoCents },
  { rotulo: 'PIX', valorCents: pdv.value.pixCents },
  { rotulo: 'VOUCHER', valorCents: pdv.value.voucherCents },
  { rotulo: 'DINHEIRO', valorCents: pdv.value.dinheiroCents },
  { rotulo: 'COLABORADOR', valorCents: valorPorAjuste('colaboradores') },
  { rotulo: 'SOBRA/PERDA', valorCents: valorPorAjuste('sobraPerda') },
  { rotulo: 'FURTO/ROUBO', valorCents: valorPorAjuste('rouboFurto') },
  { rotulo: 'LANCHES', valorCents: valorPorAjuste('alimentacao') },
]);

const { carregando: carregandoProdutos, erro: erroProdutos, produtos, buscarPorData: buscarProdutos } = useVendasProdutoDia();
const produtosJaBuscados = ref(false);
async function aoAbrirProdutos(): Promise<void> {
  if (produtosJaBuscados.value) return;
  produtosJaBuscados.value = true;
  await buscarProdutos(props.draft.data);
}
function formatarQtd(qtd: number): string {
  return qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
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
    <v-expansion-panels variant="accordion">
      <v-expansion-panel>
        <v-expansion-panel-title>Vendas</v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="d-flex flex-column ga-2">
            <div v-for="cat in vendasPorCategoria" :key="cat.rotulo" class="d-flex justify-space-between text-body-2">
              <span class="text-medium-emphasis">{{ cat.rotulo }}</span>
              <strong>R$ {{ formatCents(cat.valorCents) }}</strong>
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel @group:selected="({ value }) => value && aoAbrirProdutos()">
        <v-expansion-panel-title>Produtos vendidos no dia</v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="text-caption text-medium-emphasis mb-3">
            Loja inteira (não separado por caixa) — a origem dos dados não liga produto a caixa/turno.
            Vendas de hoje só aparecem depois que o bot da loja rodar à noite (22h10).
          </p>
          <div v-if="carregandoProdutos" class="d-flex justify-center py-4">
            <v-progress-circular indeterminate color="primary" size="24" />
          </div>
          <v-alert v-else-if="erroProdutos" type="error" variant="tonal" density="comfortable">{{ erroProdutos }}</v-alert>
          <v-alert v-else-if="produtos.length === 0" type="info" variant="tonal" density="comfortable">
            Nenhum produto sincronizado para {{ draft.data }}.
          </v-alert>
          <div v-else class="tabela-produtos-wrap">
            <table class="tabela-produtos">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th class="text-right">Quant.</th>
                  <th class="text-right">V. Unit.</th>
                  <th class="text-right">V. Total</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(p, i) in produtos" :key="`${p.produtoCodigo}-${i}`">
                  <td>{{ p.produto }}</td>
                  <td class="text-right">{{ formatarQtd(p.quantidade) }}</td>
                  <td class="text-right">R$ {{ formatCents(p.valorUnitarioCents) }}</td>
                  <td class="text-right">R$ {{ formatCents(p.totalCents) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

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

<style scoped>
.tabela-produtos-wrap {
  overflow-x: auto;
}
.tabela-produtos {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--cx-fs-caption);
}
.tabela-produtos th {
  padding: var(--cx-sp-2) var(--cx-sp-3);
  color: var(--cx-ink-soft, rgba(0, 0, 0, 0.6));
  font-weight: 700;
  text-align: left;
  border-bottom: 1px solid var(--cx-border, rgba(0, 0, 0, 0.12));
  white-space: nowrap;
}
.tabela-produtos td {
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border-bottom: 1px solid var(--cx-border, rgba(0, 0, 0, 0.08));
  white-space: nowrap;
}
</style>
