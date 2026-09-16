<script setup lang="ts">
// Mesmo comportamento do `.numbers-only` atual: só dígitos, sem máscara (usado em lacre,
// nº de clientes, nº de maquininha).
withDefaults(defineProps<{ modelValue: string; label: string; placeholder?: string }>(), {
  placeholder: '',
});

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

function aoDigitar(valorBruto: string | number | null): void {
  emit('update:modelValue', String(valorBruto ?? '').replace(/\D/g, ''));
}
</script>

<template>
  <v-text-field
    :model-value="modelValue"
    :label="label"
    :placeholder="placeholder"
    inputmode="numeric"
    @update:model-value="aoDigitar"
  />
</template>
