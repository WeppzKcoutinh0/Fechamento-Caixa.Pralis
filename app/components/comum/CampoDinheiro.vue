<script setup lang="ts">
import { computed } from 'vue';
import { formatCents } from '~/utils/financeiro';

const props = withDefaults(
  defineProps<{
    modelValue: number;
    label: string;
    required?: boolean;
    readonly?: boolean;
  }>(),
  {
    required: false,
    readonly: false,
  },
);

const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>();

// Mesmo algoritmo do `aplicarMascaraMoeda` atual: os dígitos digitados SÃO os centavos
// (preenchimento incremental da direita para a esquerda) — não é um comportamento novo.
const display = computed(() => formatCents(props.modelValue || 0));

function aoDigitar(valorBruto: string | number | null): void {
  const digitos = String(valorBruto ?? '').replace(/\D/g, '');
  const cents = digitos ? parseInt(digitos, 10) : 0;
  emit('update:modelValue', cents);
}
</script>

<template>
  <v-text-field
    :model-value="display"
    :label="label"
    :required="required"
    :readonly="readonly"
    prefix="R$"
    inputmode="decimal"
    class="campo-dinheiro"
    @update:model-value="aoDigitar"
  />
</template>

<style scoped>
.campo-dinheiro :deep(input) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
