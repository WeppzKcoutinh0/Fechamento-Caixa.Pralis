<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import type { FechamentoDraft } from '~/types/fechamento';
import CampoDinheiro from '~/components/comum/CampoDinheiro.vue';
import CartaoValor from '~/components/comum/CartaoValor.vue';
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
  transferenciaSaidaCents,
  transferenciaEntradaCents,
  transferenciasRecebidas,
  lacreAberturaValorCents,
  relatorio,
  fisico,
} = useRelatorioCalculado(toRef(props, 'draft'));

// Notas/Moedas (pedido do usuário, 23/09/2026): dinheiroContadoCents deixa de ser digitado
// direto — vira sempre a soma automática dos dois, atualizada a cada alteração de qualquer um.
function aoAlterarNotasContadas(cents: number): void {
  props.draft.dinheiroContadoNotasCents = cents;
  props.draft.dinheiroContadoCents = cents + props.draft.dinheiroContadoMoedasCents;
}
function aoAlterarMoedasContadas(cents: number): void {
  props.draft.dinheiroContadoMoedasCents = cents;
  props.draft.dinheiroContadoCents = props.draft.dinheiroContadoNotasCents + cents;
}

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

const {
  carregando: carregandoProdutos,
  erro: erroProdutos,
  produtos,
  buscarPorData: buscarProdutos,
} = useVendasProdutoDia();
const produtosJaBuscados = ref(false);
async function aoAbrirProdutos(): Promise<void> {
  if (produtosJaBuscados.value) return;
  produtosJaBuscados.value = true;
  await buscarProdutos(props.draft.data);
}
function formatarQtd(qtd: number): string {
  return qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

// Relatório em accordion por categoria (pedido do usuário, 21/09/2026, réplica da estrutura do
// "RELATORIO" da planilha antiga do Pralís: Venda/Transferências/Despesas/Mercadorias/Retiradas/
// Diferença, cada uma clicável pra expandir o detalhe). A planilha antiga tinha, dentro de
// Transferências, um mecanismo de ESCOLHER manualmente uma "conta destino" (CT CX1/CT Fluxo
// Cartões/CT Cofre) por lançamento — isso é um motor de roteamento contábil à parte, não existe
// nesta versão (decisão confirmada com o usuário: reaproveitar só a estrutura de categorias que
// JÁ existe no app, sem esse roteamento manual).
const totalTransferidoEntreCaixasCents = computed(() =>
  props.draft.transferenciasCaixa.reduce((soma, t) => soma + t.valorCents, 0),
);

// Mesma soma de draft.pdvEntradas usada em SecaoTransferencias.vue — não repete busca nenhuma,
// só lê o que "Buscar vendas" já gravou (idempotente, nunca duplica).
type CampoPdv = 'dinheiroCents' | 'creditoCents' | 'debitoCents' | 'pixCents' | 'voucherCents' | 'crediarioCents';
function somaPdv(campo: CampoPdv): number {
  return props.draft.pdvEntradas.reduce((soma, p) => soma + p[campo], 0);
}
// Detalhe por PDV (pedido do usuário, 22/09/2026) — mesma ideia de SecaoTransferencias.vue:
// clicar num card individual expande mostrando quanto cada PDV da Seção 1 contribuiu.
function detalhesPorPdv(campo: CampoPdv): { rotulo: string; valorCents: number }[] {
  return props.draft.pdvEntradas.map((p, i) => ({ rotulo: `PDV ${i + 1}`, valorCents: p[campo] }));
}
const transferenciasAutomaticas = computed(() => [
  { rotulo: 'CREDITO', valorCents: somaPdv('creditoCents'), detalhes: detalhesPorPdv('creditoCents') },
  { rotulo: 'DEBITO', valorCents: somaPdv('debitoCents'), detalhes: detalhesPorPdv('debitoCents') },
  { rotulo: 'PIX', valorCents: somaPdv('pixCents'), detalhes: detalhesPorPdv('pixCents') },
  { rotulo: 'VOUCHER', valorCents: somaPdv('voucherCents'), detalhes: detalhesPorPdv('voucherCents') },
  { rotulo: 'DINHEIRO', valorCents: somaPdv('dinheiroCents'), detalhes: detalhesPorPdv('dinheiroCents') },
  { rotulo: 'CREDIARIO', valorCents: somaPdv('crediarioCents'), detalhes: detalhesPorPdv('crediarioCents') },
  ...(lacreAberturaValorCents.value > 0
    ? [
        {
          rotulo: 'TRANSFERÊNCIAS DE ENTRADA',
          valorCents: lacreAberturaValorCents.value,
          detalhes: [{ rotulo: `Lacre ${props.draft.lacreAbertura}`, valorCents: lacreAberturaValorCents.value }],
        },
      ]
    : []),
  ...transferenciasRecebidas.value.map((r) => ({
    rotulo: r.caixaOrigem.toUpperCase(),
    valorCents: r.valorCents,
    detalhes: [{ rotulo: `Recebido de ${r.caixaOrigem}`, valorCents: r.valorCents }],
  })),
]);

// Mesmo filtro de SecaoLancamentos.vue: os 4 ajustes com bloco automático dedicado somem da
// lista MANUAL (já aparecem no bloco automático abaixo), mas continuam com `tipo: 'despesa'` /
// `'mercadoria'` de sempre — o motor de cálculo (lancamentosPorTipo acima) não filtra por
// origemAjusteCreare e continua somando todos eles normalmente.
const ORIGENS_COM_BLOCO_AUTOMATICO: readonly string[] = [
  'colaboradores',
  'alimentacao',
  'sobraPerda',
  'rouboFurto',
];
const despesasManuais = computed(() =>
  props.draft.lancamentos.filter(
    (l) => l.tipo === 'despesa' && !ORIGENS_COM_BLOCO_AUTOMATICO.includes(l.origemAjusteCreare),
  ),
);
const mercadoriasManuais = computed(() =>
  props.draft.lancamentos.filter(
    (l) => l.tipo === 'mercadoria' && !ORIGENS_COM_BLOCO_AUTOMATICO.includes(l.origemAjusteCreare),
  ),
);
const retiradas = computed(() => props.draft.lancamentos.filter((l) => l.tipo === 'retirada'));

// Detalhe ao expandir (pedido do usuário, 22/09/2026): diferente das formas de pagamento
// (draft.pdvEntradas guarda um valor por PDV), os ajustes do CREARE já chegam SOMADOS num único
// lançamento por categoria (aplicarAjustesComoLancamentos, ver utils/vendasFechamento.ts) — não
// existe "por PDV" pra detalhar aqui. O que existe de verdade é o `obsTexto` que essa função já
// grava em cada lançamento pra auditoria ("valor original: ±R$X"), incluindo o sinal (sobra é
// diferente de perda) que o card em cima não mostra. Expandir revela essa nota.
function observacaoPorAjuste(chave: string): string {
  const lancamento = props.draft.lancamentos.find((l) => l.origemAjusteCreare === chave);
  return lancamento?.obsTexto || 'Nenhum ajuste sincronizado ainda para esta categoria.';
}
const despesasAutomaticas = computed(() => [
  { rotulo: 'COLABORADOR', valorCents: valorPorAjuste('colaboradores'), observacao: observacaoPorAjuste('colaboradores') },
  { rotulo: 'LANCHES', valorCents: valorPorAjuste('alimentacao'), observacao: observacaoPorAjuste('alimentacao') },
]);
const mercadoriasAutomaticas = computed(() => [
  { rotulo: 'SOBRA/PERDA', valorCents: valorPorAjuste('sobraPerda'), observacao: observacaoPorAjuste('sobraPerda') },
  { rotulo: 'FURTO/ROUBO', valorCents: valorPorAjuste('rouboFurto'), observacao: observacaoPorAjuste('rouboFurto') },
]);

const CAT_VARS = {
  venda: {
    '--cat': 'var(--cat-venda-base)',
    '--cat-soft': 'var(--cat-venda-soft)',
    '--cat-tinta': 'var(--cat-venda-tinta)',
  },
  transferencias: {
    '--cat': 'var(--cat-transferencias-base)',
    '--cat-soft': 'var(--cat-transferencias-soft)',
    '--cat-tinta': 'var(--cat-transferencias-tinta)',
  },
  despesas: {
    '--cat': 'var(--cat-despesas-base)',
    '--cat-soft': 'var(--cat-despesas-soft)',
    '--cat-tinta': 'var(--cat-despesas-tinta)',
  },
  mercadorias: {
    '--cat': 'var(--cat-mercadorias-base)',
    '--cat-soft': 'var(--cat-mercadorias-soft)',
    '--cat-tinta': 'var(--cat-mercadorias-tinta)',
  },
  retiradas: {
    '--cat': 'var(--cat-retiradas-base)',
    '--cat-soft': 'var(--cat-retiradas-soft)',
    '--cat-tinta': 'var(--cat-retiradas-tinta)',
  },
  resultado: {
    '--cat': 'var(--cat-resultado-base)',
    '--cat-soft': 'var(--cat-resultado-soft)',
    '--cat-tinta': 'var(--cat-resultado-tinta)',
  },
} as const;
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

    <div class="grade-cartoes">
      <CartaoValor rotulo="Cartões" :valor="`R$ ${formatCents(relatorio.cartoesCents)}`" />
      <CartaoValor
        rotulo="Rel. PDV Diferença"
        :valor="`R$ ${formatCents(relatorio.relPdvDiferencaCents)}`"
      />
    </div>

    <!-- Relatório em categorias clicáveis (pedido do usuário, 21/09/2026) — réplica da estrutura
         VENDA/TRANSFERÊNCIAS/DESPESAS/MERCADORIAS/RETIRADAS/DIFERENÇA da planilha antiga do
         Pralís: clicar numa categoria expande o detalhe dela. -->
    <v-expansion-panels variant="accordion" class="cat-accordion">
      <v-expansion-panel class="cat-painel" :style="CAT_VARS.venda">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Venda</span>
          <strong class="cat-valor">R$ {{ formatCents(relatorio.valorTotalFinalCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="d-flex flex-column ga-2 mb-4">
            <div
              v-for="cat in vendasPorCategoria"
              :key="cat.rotulo"
              class="d-flex justify-space-between text-body-2"
            >
              <span class="text-medium-emphasis">{{ cat.rotulo }}</span>
              <strong>R$ {{ formatCents(cat.valorCents) }}</strong>
            </div>
          </div>

          <v-expansion-panels variant="accordion">
            <v-expansion-panel @group:selected="({ value }) => value && aoAbrirProdutos()">
              <v-expansion-panel-title>Produtos vendidos no dia</v-expansion-panel-title>
              <v-expansion-panel-text>
                <p class="text-caption text-medium-emphasis mb-3">
                  Loja inteira (não separado por caixa) — a origem dos dados não liga produto a
                  caixa/turno. Vendas de hoje só aparecem depois que o bot da loja rodar à noite
                  (22h10).
                </p>
                <div v-if="carregandoProdutos" class="d-flex justify-center py-4">
                  <v-progress-circular indeterminate color="primary" size="24" />
                </div>
                <v-alert
                  v-else-if="erroProdutos"
                  type="error"
                  variant="tonal"
                  density="comfortable"
                  >{{ erroProdutos }}</v-alert
                >
                <v-alert
                  v-else-if="produtos.length === 0"
                  type="info"
                  variant="tonal"
                  density="comfortable"
                >
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
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel class="cat-painel" :style="CAT_VARS.transferencias">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Transferências</span>
          <strong class="cat-valor"
            >R$
            {{
              formatCents(
                totalEntradaCents -
                  totalSaidaCents +
                  transferenciaEntradaCents +
                  lacreAberturaValorCents -
                  transferenciaSaidaCents,
              )
            }}</strong
          >
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="cat-subgrupo">Manuais</p>
          <div class="d-flex flex-column ga-2 mb-4">
            <div class="d-flex justify-space-between text-body-2">
              <span class="text-medium-emphasis">Total Entrada</span>
              <strong>R$ {{ formatCents(totalEntradaCents) }}</strong>
            </div>
            <div class="d-flex justify-space-between text-body-2">
              <span class="text-medium-emphasis">Total Saída / Sangria</span>
              <strong>R$ {{ formatCents(totalSaidaCents) }}</strong>
            </div>
            <div class="d-flex justify-space-between text-body-2">
              <span class="text-medium-emphasis">Total Transferido entre caixas</span>
              <strong>R$ {{ formatCents(totalTransferidoEntreCaixasCents) }}</strong>
            </div>
            <div class="d-flex justify-space-between text-body-2">
              <span class="text-medium-emphasis"
                >↳ Saída confirmada deste caixa (conta na Diferença)</span
              >
              <strong>R$ {{ formatCents(transferenciaSaidaCents) }}</strong>
            </div>
          </div>
          <p class="cat-subgrupo">Automáticas</p>
          <v-expansion-panels variant="accordion" class="cat-subacordeao">
            <v-expansion-panel v-for="item in transferenciasAutomaticas" :key="item.rotulo" class="cat-subitem">
              <v-expansion-panel-title class="cat-subitem-titulo">
                <span class="d-flex flex-column">
                  <span class="cat-subitem-rotulo">{{ item.rotulo }}</span>
                  <strong class="cat-subitem-valor">R$ {{ formatCents(item.valorCents) }}</strong>
                </span>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="d-flex flex-column ga-1">
                  <div
                    v-for="d in item.detalhes"
                    :key="d.rotulo"
                    class="d-flex justify-space-between text-body-2"
                  >
                    <span class="text-medium-emphasis">{{ d.rotulo }}</span>
                    <strong>R$ {{ formatCents(d.valorCents) }}</strong>
                  </div>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel class="cat-painel" :style="CAT_VARS.despesas">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Despesas</span>
          <strong class="cat-valor">R$ {{ formatCents(lancamentosPorTipo.despesaCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="cat-subgrupo">Manuais</p>
          <div v-if="!despesasManuais.length" class="text-caption text-medium-emphasis mb-4">
            Nenhuma despesa manual lançada.
          </div>
          <div v-else class="d-flex flex-column ga-2 mb-4">
            <div
              v-for="d in despesasManuais"
              :key="d.id"
              class="d-flex justify-space-between text-body-2"
            >
              <span class="text-medium-emphasis">{{ d.fornecedor || 'Sem credor' }}</span>
              <strong>R$ {{ formatCents(d.valorCents + d.valorAcrescimoCents) }}</strong>
            </div>
          </div>
          <p class="cat-subgrupo">Automáticas</p>
          <v-expansion-panels variant="accordion" class="cat-subacordeao">
            <v-expansion-panel v-for="item in despesasAutomaticas" :key="item.rotulo" class="cat-subitem">
              <v-expansion-panel-title class="cat-subitem-titulo">
                <span class="d-flex flex-column">
                  <span class="cat-subitem-rotulo">{{ item.rotulo }}</span>
                  <strong class="cat-subitem-valor">R$ {{ formatCents(item.valorCents) }}</strong>
                </span>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <p class="text-body-2 text-medium-emphasis mb-0">{{ item.observacao }}</p>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel class="cat-painel" :style="CAT_VARS.mercadorias">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Mercadorias</span>
          <strong class="cat-valor"
            >R$ {{ formatCents(lancamentosPorTipo.mercadoriaCents) }}</strong
          >
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="cat-subgrupo">Manuais</p>
          <div v-if="!mercadoriasManuais.length" class="text-caption text-medium-emphasis mb-4">
            Nenhuma mercadoria manual lançada.
          </div>
          <div v-else class="d-flex flex-column ga-2 mb-4">
            <div
              v-for="m in mercadoriasManuais"
              :key="m.id"
              class="d-flex justify-space-between text-body-2"
            >
              <span class="text-medium-emphasis">{{ m.fornecedor || 'Sem credor' }}</span>
              <strong>R$ {{ formatCents(m.valorCents + m.valorAcrescimoCents) }}</strong>
            </div>
          </div>
          <p class="cat-subgrupo">Automáticas</p>
          <v-expansion-panels variant="accordion" class="cat-subacordeao">
            <v-expansion-panel v-for="item in mercadoriasAutomaticas" :key="item.rotulo" class="cat-subitem">
              <v-expansion-panel-title class="cat-subitem-titulo">
                <span class="d-flex flex-column">
                  <span class="cat-subitem-rotulo">{{ item.rotulo }}</span>
                  <strong class="cat-subitem-valor">R$ {{ formatCents(item.valorCents) }}</strong>
                </span>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <p class="text-body-2 text-medium-emphasis mb-0">{{ item.observacao }}</p>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel class="cat-painel" :style="CAT_VARS.retiradas">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Retiradas</span>
          <strong class="cat-valor">R$ {{ formatCents(lancamentosPorTipo.retiradaCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div v-if="!retiradas.length" class="text-caption text-medium-emphasis">
            Nenhuma retirada lançada.
          </div>
          <div v-else class="d-flex flex-column ga-2">
            <div
              v-for="r in retiradas"
              :key="r.id"
              class="d-flex justify-space-between text-body-2"
            >
              <span class="text-medium-emphasis">{{ r.fornecedor || 'Sem credor' }}</span>
              <strong>R$ {{ formatCents(r.valorCents + r.valorAcrescimoCents) }}</strong>
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel class="cat-painel" :style="CAT_VARS.resultado">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Diferença</span>
          <strong class="cat-valor">R$ {{ formatCents(relatorio.diferencaCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="cat-subgrupo">Conferência por forma de pagamento</p>
          <v-card
            v-for="forma in ['Crédito', 'Débito', 'Pix', 'Voucher', 'Crediário'] as const"
            :key="forma"
            variant="outlined"
            class="pa-3 mb-2"
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
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <v-divider />
    <div class="text-subtitle-2">Dinheiro esperado × contado</div>
    <p class="text-caption text-medium-emphasis">
      Informativo — não altera a Diferença Geral acima. Esperado = dinheiro do PDV + entradas +
      transferências recebidas − sangrias − despesas − mercadorias − retiradas − transferências
      enviadas.
    </p>
    <CartaoValor
      rotulo="Dinheiro esperado na gaveta"
      :valor="`R$ ${formatCents(fisico.expectedCents)}`"
      class="mb-3"
    />
    <div class="d-flex flex-column flex-sm-row ga-3">
      <CampoDinheiro
        :model-value="draft.dinheiroContadoNotasCents"
        label="Valor Notas"
        @update:model-value="aoAlterarNotasContadas"
      />
      <CampoDinheiro
        :model-value="draft.dinheiroContadoMoedasCents"
        label="Valor Moedas"
        @update:model-value="aoAlterarMoedasContadas"
      />
      <CampoDinheiro :model-value="draft.dinheiroContadoCents" label="Valor Total" readonly />
    </div>
    <v-text-field
      v-model="draft.lacreFechamento"
      label="N° Lacre do malote"
      class="mt-3"
      hint="Identifica o malote que leva esse dinheiro contado de volta ao cofre — sobe junto com esses valores pro administrador conferir."
      persistent-hint
    />
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
/* .cat-* (accordion por categoria colorida) agora vive em assets/main.css — era só daqui
   ("scoped"), então nunca aplicava nos accordions equivalentes de outras telas (mesmo bug já
   corrigido uma vez com .lc-painel/.lc-painel-corpo). */

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
