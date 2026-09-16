<script setup lang="ts">
// Valor só-leitura calculado (totais, conferências): cartão pequeno em vez de v-text-field
// readonly. Um campo de formulário sugere "preencha aqui"; um número que ninguém digita não é
// um campo — é um dado, e dado se lê melhor num rótulo + valor do que numa caixa de input vazia.
withDefaults(
  defineProps<{
    rotulo: string;
    valor: string;
    tom?: 'neutro' | 'positivo' | 'negativo';
  }>(),
  { tom: 'neutro' },
);
</script>

<template>
  <div class="cartao-valor" :class="`cartao-valor--${tom}`">
    <span class="cartao-valor-rotulo">{{ rotulo }}</span>
    <span class="cartao-valor-numero cx-num">{{ valor }}</span>
  </div>
</template>

<style scoped>
.cartao-valor {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}

.cartao-valor-rotulo {
  overflow: hidden;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cartao-valor-numero {
  color: var(--cx-ink);
  font-size: var(--cx-fs-lead);
  font-weight: 600;
}

.cartao-valor--positivo .cartao-valor-numero {
  color: var(--cx-positive);
}
.cartao-valor--negativo .cartao-valor-numero {
  color: var(--cx-negative);
}
</style>
