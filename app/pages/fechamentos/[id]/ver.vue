<script setup lang="ts">
import { onMounted, ref, toRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useFechamentos } from '~/composables/useFechamentos';
import { useRelatorioCalculado } from '~/composables/useRelatorioCalculado';
import { criarFechamentoVazio, type FechamentoDraft } from '~/types/fechamento';
import { calculateDiscrimination, formatCents } from '~/utils/financeiro';
import { mensagemDeErro } from '~/utils/erros';
import AppCabecalhoTela from '~/components/app/AppCabecalhoTela.vue';
import CockpitCategorias from '~/components/fechamento/CockpitCategorias.vue';

const route = useRoute();
const router = useRouter();
const { obter } = useFechamentos();

const carregando = ref(true);
const erro = ref<string | null>(null);
const draft = ref<FechamentoDraft>(criarFechamentoVazio());

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
} = useRelatorioCalculado(toRef(draft, 'value'));

onMounted(async () => {
  try {
    draft.value = await obter(String(route.params.id));
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível carregar o fechamento.');
  } finally {
    carregando.value = false;
  }
});

function formatarDataBR(data: string): string {
  if (!data) return '—';
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}

const ROTULOS_TIPO: Record<string, string> = {
  despesa: 'Despesa',
  mercadoria: 'Mercadoria',
  retirada: 'Retirada',
};
const ROTULOS_STATUS: Record<string, string> = { pago: 'Pago', naopago: 'Não Pago' };

const STATUS_TEXTO = { zero: '✔ Caixa fechado sem diferença!', sobra: 'Sobra', falta: 'Falta' };
const STATUS_COR = { zero: 'default', sobra: 'success', falta: 'error' } as const;

function totalDiscriminacao(d: FechamentoDraft['discriminacoes'][number]): number {
  return calculateDiscrimination({
    quantity: d.qtd,
    unitValueCents: d.valUnitCents,
    fixedDiscountCents: d.descontoValCents,
    discountPercent: d.descontoPct,
  }).totalCents;
}

function totalPdvEntrada(p: FechamentoDraft['pdvEntradas'][number]): number {
  return (
    p.dinheiroCents +
    p.creditoCents +
    p.debitoCents +
    p.pixCents +
    p.voucherCents +
    p.crediarioCents
  );
}
</script>

<template>
  <v-container class="py-6" style="max-width: 640px">
    <AppCabecalhoTela titulo="Relatório do Fechamento">
      <template #acoes>
        <v-btn
          v-if="!carregando && !erro"
          variant="text"
          prepend-icon="mdi-pencil"
          @click="router.push(`/fechamentos/${draft.id}`)"
        >
          Editar
        </v-btn>
      </template>
    </AppCabecalhoTela>

    <div v-if="carregando" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <v-alert v-else-if="erro" type="error" variant="tonal">{{ erro }}</v-alert>

    <div v-else class="d-flex flex-column ga-4">
      <v-card variant="outlined" rounded="lg" class="pa-4">
        <div class="text-subtitle-2 mb-2">Identificação</div>
        <div class="text-body-2 text-medium-emphasis">{{ draft.codigo }}</div>
        <div class="text-body-2">
          {{ formatarDataBR(draft.data) }} — {{ draft.caixa || '—' }} / {{ draft.turno || '—' }}
        </div>
        <div class="text-body-2">Responsável: {{ draft.responsavel || '—' }}</div>
      </v-card>

      <v-card variant="outlined" rounded="lg" class="pa-4">
        <div class="text-subtitle-2 mb-2">
          Transferência de Entrada — Total: R$ {{ formatCents(totalEntradaCents) }}
        </div>
        <div v-if="draft.entradas.length === 0" class="text-body-2 text-medium-emphasis">
          Nenhuma entrada registrada.
        </div>
        <div
          v-for="(e, i) in draft.entradas"
          :key="i"
          class="d-flex justify-space-between text-body-2 py-1"
        >
          <span
            >{{ e.descricao || 'Sem descrição' }}
            <span v-if="e.lacre" class="text-medium-emphasis">(lacre {{ e.lacre }})</span></span
          >
          <strong>R$ {{ formatCents(e.valorCents) }}</strong>
        </div>
      </v-card>

      <v-card variant="outlined" rounded="lg" class="pa-4">
        <div class="text-subtitle-2 mb-2">
          Transferência de Saída / Sangria — Total: R$ {{ formatCents(totalSaidaCents) }}
        </div>
        <div v-if="draft.sangrias.length === 0" class="text-body-2 text-medium-emphasis">
          Nenhuma sangria registrada.
        </div>
        <div
          v-for="(s, i) in draft.sangrias"
          :key="i"
          class="d-flex justify-space-between text-body-2 py-1"
        >
          <span
            >{{ s.descricao || 'Sem descrição' }}
            <span v-if="s.lacre" class="text-medium-emphasis">(lacre {{ s.lacre }})</span></span
          >
          <strong>R$ {{ formatCents(s.valorCents) }}</strong>
        </div>
      </v-card>

      <v-card v-if="draft.lancamentos.length > 0" variant="outlined" rounded="lg" class="pa-4">
        <div class="text-subtitle-2 mb-2">Lançamentos</div>
        <div
          v-for="(l, i) in draft.lancamentos"
          :key="i"
          class="d-flex justify-space-between align-center text-body-2 py-1"
        >
          <span>
            <v-chip size="x-small" class="mr-1">{{ ROTULOS_TIPO[l.tipo] }}</v-chip>
            {{ l.fornecedor || 'Sem descrição' }}
            <v-chip
              size="x-small"
              :color="l.status === 'pago' ? 'success' : 'warning'"
              class="ml-1"
              >{{ ROTULOS_STATUS[l.status] }}</v-chip
            >
          </span>
          <strong>R$ {{ formatCents(l.valorCents) }}</strong>
        </div>
      </v-card>

      <v-card variant="outlined" rounded="lg" class="pa-4">
        <div class="text-subtitle-2 mb-2">
          Relatório PDV — Total: R$ {{ formatCents(pdv.totalCents) }}
        </div>
        <div v-if="draft.pdvEntradas.length === 0" class="text-body-2 text-medium-emphasis">
          Nenhum PDV registrado.
        </div>
        <div
          v-for="(p, i) in draft.pdvEntradas"
          :key="p.id"
          class="py-1"
          :class="{ 'border-t': i > 0 }"
        >
          <div class="d-flex justify-space-between text-body-2">
            <strong>PDV {{ i + 1 }}</strong>
            <strong>R$ {{ formatCents(totalPdvEntrada(p)) }}</strong>
          </div>
          <div class="d-flex justify-space-between text-caption text-medium-emphasis">
            <span>Nº Clientes</span><span>{{ p.nrClientes || 0 }}</span>
          </div>
          <div class="d-flex justify-space-between text-caption text-medium-emphasis">
            <span>Dinheiro</span><span>R$ {{ formatCents(p.dinheiroCents) }}</span>
          </div>
          <div class="d-flex justify-space-between text-caption text-medium-emphasis">
            <span>Crédito</span><span>R$ {{ formatCents(p.creditoCents) }}</span>
          </div>
          <div class="d-flex justify-space-between text-caption text-medium-emphasis">
            <span>Débito</span><span>R$ {{ formatCents(p.debitoCents) }}</span>
          </div>
          <div class="d-flex justify-space-between text-caption text-medium-emphasis">
            <span>Pix</span><span>R$ {{ formatCents(p.pixCents) }}</span>
          </div>
          <div class="d-flex justify-space-between text-caption text-medium-emphasis">
            <span>Voucher</span><span>R$ {{ formatCents(p.voucherCents) }}</span>
          </div>
          <div class="d-flex justify-space-between text-caption text-medium-emphasis">
            <span>Crediário</span><span>R$ {{ formatCents(p.crediarioCents) }}</span>
          </div>
        </div>
      </v-card>

      <v-card variant="outlined" rounded="lg" class="pa-4">
        <div class="text-subtitle-2 mb-2">Relatório Cartões (líquido)</div>
        <div class="d-flex justify-space-between text-body-2">
          <span>Crédito</span><strong>R$ {{ formatCents(liqCreditoCents) }}</strong>
        </div>
        <div class="d-flex justify-space-between text-body-2">
          <span>Débito</span><strong>R$ {{ formatCents(liqDebitoCents) }}</strong>
        </div>
        <div class="d-flex justify-space-between text-body-2">
          <span>Pix</span><strong>R$ {{ formatCents(liqPixCents) }}</strong>
        </div>
        <div class="d-flex justify-space-between text-body-2">
          <span>Voucher</span><strong>R$ {{ formatCents(liqVoucherCents) }}</strong>
        </div>
      </v-card>

      <v-card v-if="draft.crediario.length > 0" variant="outlined" rounded="lg" class="pa-4">
        <div class="text-subtitle-2 mb-2">
          Crediário — Total: R$ {{ formatCents(crediarioTotais.totalCents) }}
        </div>
        <div
          v-for="(c, i) in draft.crediario"
          :key="i"
          class="d-flex justify-space-between text-body-2 py-1"
        >
          <span
            >{{ c.tipo === 'cliente' ? '👤' : '👷' }} {{ c.nome || '—' }}
            <span class="text-medium-emphasis">({{ c.tipo }})</span></span
          >
          <strong>R$ {{ formatCents(c.valorCents) }}</strong>
        </div>
      </v-card>

      <v-card v-if="draft.discriminacoes.length > 0" variant="outlined" rounded="lg" class="pa-4">
        <div class="text-subtitle-2 mb-2">Discriminação</div>
        <div
          v-for="(d, i) in draft.discriminacoes"
          :key="i"
          class="d-flex justify-space-between text-body-2 py-1"
        >
          <span>
            <v-chip size="x-small" class="mr-1">{{ ROTULOS_TIPO[d.tipo] }}</v-chip>
            {{ d.produto || 'Sem nome' }} — {{ d.qtd }}x
          </span>
          <strong>R$ {{ formatCents(totalDiscriminacao(d)) }}</strong>
        </div>
      </v-card>

      <v-card v-if="draft.dinheiroContadoConfirmado" variant="outlined" rounded="lg" class="pa-4">
        <div class="text-subtitle-2 mb-2">Transferência Final</div>
        <div class="d-flex justify-space-between text-body-2">
          <span class="text-medium-emphasis">N° Lacre final</span>
          <strong>{{ draft.lacreFechamento || '—' }}</strong>
        </div>
        <div class="d-flex justify-space-between text-body-2">
          <span class="text-medium-emphasis">Valor em Notas</span>
          <strong>R$ {{ formatCents(draft.dinheiroContadoNotasCents) }}</strong>
        </div>
        <div class="d-flex justify-space-between text-body-2">
          <span class="text-medium-emphasis">Valor em Moedas</span>
          <strong>R$ {{ formatCents(draft.dinheiroContadoMoedasCents) }}</strong>
        </div>
        <div class="d-flex justify-space-between text-body-2">
          <span class="text-medium-emphasis">Contado na gaveta</span>
          <strong>R$ {{ formatCents(draft.dinheiroContadoCents) }}</strong>
        </div>
        <v-divider class="my-2" />
        <div class="d-flex justify-space-between text-body-2">
          <span class="text-medium-emphasis">Esperado na gaveta</span>
          <strong>R$ {{ formatCents(fisico.expectedCents) }}</strong>
        </div>
        <div class="d-flex justify-space-between text-body-2">
          <span class="text-medium-emphasis">
            {{
              fisico.differenceCents === 0
                ? 'Igualado'
                : fisico.differenceCents > 0
                  ? 'Sobra (contado − esperado)'
                  : 'Falta (contado − esperado)'
            }}
          </span>
          <strong
            :class="{
              'text-success': fisico.differenceCents > 0,
              'text-error': fisico.differenceCents < 0,
            }"
            >R$ {{ formatCents(fisico.differenceCents) }}</strong
          >
        </div>
      </v-card>

      <div>
        <div class="text-subtitle-2 mb-2">Relatório Final</div>
        <CockpitCategorias
          :venda-cents="relatorio.valorTotalFinalCents"
          :transferencias-entrada-cents="totalEntradaCents"
          :transferencias-saida-cents="totalSaidaCents"
          :despesas-cents="lancamentosPorTipo.despesaCents"
          :mercadorias-cents="lancamentosPorTipo.mercadoriaCents"
          :retiradas-cents="lancamentosPorTipo.retiradaCents"
          :resultado-cents="relatorio.diferencaCents"
        />
      </div>

      <v-card
        :color="STATUS_COR[relatorio.status]"
        :variant="relatorio.status === 'zero' ? 'outlined' : 'tonal'"
        class="pa-4"
        rounded="lg"
      >
        <div class="text-caption">⚖ Diferença Geral</div>
        <div class="text-h5">R$ {{ formatCents(Math.abs(relatorio.diferencaCents)) }}</div>
        <div class="text-body-2">
          {{
            relatorio.status === 'zero'
              ? STATUS_TEXTO.zero
              : `${STATUS_TEXTO[relatorio.status]} de R$ ${formatCents(Math.abs(relatorio.diferencaCents))}`
          }}
        </div>
      </v-card>
    </div>
  </v-container>
</template>
