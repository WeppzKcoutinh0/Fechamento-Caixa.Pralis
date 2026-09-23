<script setup lang="ts">
import type { DetalheMaquininhaDraft } from '~/types/fechamento';
import { formatCents } from '~/utils/financeiro';

defineProps<{
  detalhes: DetalheMaquininhaDraft[];
  aberto: boolean;
}>();

const emit = defineEmits<{ alternar: [] }>();
</script>

<template>
  <button type="button" class="lc-detalhe-toggle" :aria-expanded="aberto" @click="emit('alternar')">
    <span>Detalhes do relatório</span>
    <v-icon size="16">{{ aberto ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
  </button>
  <div v-if="aberto" class="lc-detalhes-lista">
    <div v-for="item in detalhes" :key="`${item.nome}-${item.valorCents}`" class="lc-detalhe-item">
      <span>{{ item.nome }}</span>
      <strong>R$ {{ formatCents(item.valorCents) }}</strong>
    </div>
    <span v-if="!detalhes.length" class="text-caption text-medium-emphasis">
      Nenhum detalhe foi lido.
    </span>
  </div>
</template>

<style scoped>
.lc-detalhe-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: var(--cx-sp-2);
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--cx-brand-text);
  font: inherit;
  font-size: var(--cx-fs-micro);
  font-weight: 700;
  cursor: pointer;
}

.lc-detalhes-lista {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-1);
  margin-top: var(--cx-sp-2);
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border-radius: var(--cx-r-sm);
  background: var(--cx-brand-wash);
}

.lc-detalhe-item {
  display: flex;
  justify-content: space-between;
  gap: var(--cx-sp-3);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
}

.lc-detalhe-item strong {
  color: var(--cx-ink);
}
</style>
