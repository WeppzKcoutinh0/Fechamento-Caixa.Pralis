<script setup lang="ts">
// Valor só-leitura calculado (totais, conferências): cartão pequeno em vez de v-text-field
// readonly. Um campo de formulário sugere "preencha aqui"; um número que ninguém digita não é
// um campo — é um dado, e dado se lê melhor num rótulo + valor do que numa caixa de input vazia.
withDefaults(
  defineProps<{
    rotulo: string;
    valor: string;
    // Linha pequena abaixo do valor (pedido do usuário, 30/09/2026) — usado no card de
    // Sobra/Falta da Transferência Final pra repetir o valor com sinal, reforçando a leitura.
    subvalor?: string;
    // 'sobra' é laranja (--cx-attention), distinto de 'positivo' (verde) — pedido do usuário:
    // igualado (=0) fica verde, falta fica vermelho, sobra fica laranja (não verde).
    tom?: 'neutro' | 'positivo' | 'negativo' | 'sobra';
  }>(),
  { tom: 'neutro' },
);
</script>

<template>
  <div class="cartao-valor" :class="`cartao-valor--${tom}`">
    <span class="cartao-valor-rotulo">{{ rotulo }}</span>
    <span class="cartao-valor-numero cx-num">{{ valor }}</span>
    <span v-if="subvalor" class="cartao-valor-subvalor cx-num">{{ subvalor }}</span>
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
.cartao-valor--sobra .cartao-valor-numero {
  color: var(--cx-attention);
}

.cartao-valor-subvalor {
  font-size: var(--cx-fs-caption);
  font-weight: 500;
}
.cartao-valor--positivo .cartao-valor-subvalor {
  color: var(--cx-positive);
}
.cartao-valor--negativo .cartao-valor-subvalor {
  color: var(--cx-negative);
}
.cartao-valor--sobra .cartao-valor-subvalor {
  color: var(--cx-attention);
}
</style>
