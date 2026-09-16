<script setup lang="ts">
// Resumo por categoria — mesma ideia da planilha de fechamento do dono (VENDA, TRANSFERÊNCIAS,
// DESPESAS, MERCADORIAS, RETIRADAS, DIFERENÇA) e o mesmo "cockpit por categoria" que o Sistema
// Inteligente Pralís já usa na tela de Caixa, com a paleta idêntica (--cat-*). Os valores vêm
// SEMPRE de fora, calculados pelo núcleo financeiro que já testamos — este componente só exibe.
import { formatCents } from '~/utils/financeiro';

defineProps<{
  vendaCents: number;
  transferenciasEntradaCents: number;
  transferenciasSaidaCents: number;
  despesasCents: number;
  mercadoriasCents: number;
  retiradasCents: number;
  resultadoCents: number;
}>();
</script>

<template>
  <div class="cockpit-grid">
    <div class="cockpit-card cockpit-venda">
      <span class="cockpit-bar" aria-hidden="true" />
      <div class="cockpit-corpo">
        <div class="cockpit-cabeca">
          <span class="cockpit-chip"><v-icon icon="mdi-cash-register" size="18" /></span>
          <span class="cockpit-titulo">Venda</span>
        </div>
        <div class="cockpit-valor">R$ {{ formatCents(vendaCents) }}</div>
      </div>
    </div>

    <div class="cockpit-card cockpit-transferencias">
      <span class="cockpit-bar" aria-hidden="true" />
      <div class="cockpit-corpo">
        <div class="cockpit-cabeca">
          <span class="cockpit-chip"><v-icon icon="mdi-bank-transfer" size="18" /></span>
          <span class="cockpit-titulo">Transferências</span>
        </div>
        <div class="cockpit-valor">
          R$ {{ formatCents(transferenciasEntradaCents - transferenciasSaidaCents) }}
        </div>
        <div class="cockpit-detalhe">
          entra {{ formatCents(transferenciasEntradaCents) }} · sai
          {{ formatCents(transferenciasSaidaCents) }}
        </div>
      </div>
    </div>

    <div class="cockpit-card cockpit-despesas">
      <span class="cockpit-bar" aria-hidden="true" />
      <div class="cockpit-corpo">
        <div class="cockpit-cabeca">
          <span class="cockpit-chip"><v-icon icon="mdi-cash-minus" size="18" /></span>
          <span class="cockpit-titulo">Despesas</span>
        </div>
        <div class="cockpit-valor">R$ {{ formatCents(despesasCents) }}</div>
      </div>
    </div>

    <div class="cockpit-card cockpit-mercadorias">
      <span class="cockpit-bar" aria-hidden="true" />
      <div class="cockpit-corpo">
        <div class="cockpit-cabeca">
          <span class="cockpit-chip"><v-icon icon="mdi-package-variant-closed" size="18" /></span>
          <span class="cockpit-titulo">Mercadorias</span>
        </div>
        <div class="cockpit-valor">R$ {{ formatCents(mercadoriasCents) }}</div>
      </div>
    </div>

    <div class="cockpit-card cockpit-retiradas">
      <span class="cockpit-bar" aria-hidden="true" />
      <div class="cockpit-corpo">
        <div class="cockpit-cabeca">
          <span class="cockpit-chip"><v-icon icon="mdi-cash-remove" size="18" /></span>
          <span class="cockpit-titulo">Retiradas</span>
        </div>
        <div class="cockpit-valor">R$ {{ formatCents(retiradasCents) }}</div>
      </div>
    </div>

    <div class="cockpit-card cockpit-resultado cockpit-card--ancora">
      <span class="cockpit-bar" aria-hidden="true" />
      <div class="cockpit-corpo">
        <div class="cockpit-cabeca">
          <span class="cockpit-chip"><v-icon icon="mdi-cash-multiple" size="18" /></span>
          <span class="cockpit-titulo">Diferença</span>
        </div>
        <div class="cockpit-valor">R$ {{ formatCents(resultadoCents) }}</div>
        <div class="cockpit-detalhe">sobra ou falta do fechamento, já com cartões e crediário</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Mesma estrutura do cockpit por categoria do Pralís (CaixaResumoPage.vue): grade
   auto-responsiva, cor como ACENTO (barra + chip + texto), fundo do card em -soft — nunca a
   estrutura inteira colorida. */
.cockpit-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--cx-sp-3);
}

.cockpit-card {
  position: relative;
  display: flex;
  overflow: hidden;
  border: 1px solid var(--cat);
  border-radius: var(--cx-r-lg);
  background: var(--cat-soft);
}

.cockpit-bar {
  flex: 0 0 6px;
  background: var(--cat);
}

.cockpit-corpo {
  min-width: 0;
  padding: var(--cx-sp-3) var(--cx-sp-4);
}

.cockpit-cabeca {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-2);
}

.cockpit-chip {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--cx-r-sm);
  background: var(--cat);
  color: #fff;
}

.cockpit-titulo {
  overflow: hidden;
  color: var(--cat-tinta);
  font-size: var(--cx-fs-micro);
  font-weight: 800;
  letter-spacing: var(--cx-tracking-wide);
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.cockpit-valor {
  margin-top: var(--cx-sp-2);
  color: var(--cat-tinta);
  font-size: var(--cx-fs-title);
  font-weight: 800;
  line-height: 1.1;
}

.cockpit-detalhe {
  margin-top: 2px;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 600;
}

.cockpit-card--ancora {
  grid-column: 1 / -1;
}
.cockpit-card--ancora .cockpit-valor {
  font-size: var(--cx-fs-h2);
}

.cockpit-venda {
  --cat: var(--cat-venda-base);
  --cat-soft: var(--cat-venda-soft);
  --cat-tinta: var(--cat-venda-tinta);
}
.cockpit-transferencias {
  --cat: var(--cat-transferencias-base);
  --cat-soft: var(--cat-transferencias-soft);
  --cat-tinta: var(--cat-transferencias-tinta);
}
.cockpit-despesas {
  --cat: var(--cat-despesas-base);
  --cat-soft: var(--cat-despesas-soft);
  --cat-tinta: var(--cat-despesas-tinta);
}
.cockpit-mercadorias {
  --cat: var(--cat-mercadorias-base);
  --cat-soft: var(--cat-mercadorias-soft);
  --cat-tinta: var(--cat-mercadorias-tinta);
}
.cockpit-retiradas {
  --cat: var(--cat-retiradas-base);
  --cat-soft: var(--cat-retiradas-soft);
  --cat-tinta: var(--cat-retiradas-tinta);
}
.cockpit-resultado {
  --cat: var(--cat-resultado-base);
  --cat-soft: var(--cat-resultado-soft);
  --cat-tinta: var(--cat-resultado-tinta);
}

@media (width <= 480px) {
  .cockpit-grid {
    grid-template-columns: 1fr;
  }
}
</style>
