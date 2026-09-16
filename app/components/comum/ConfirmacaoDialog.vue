<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean;
    titulo: string;
    mensagem: string;
    textoConfirmar?: string;
  }>(),
  { textoConfirmar: 'Confirmar' },
);
const emit = defineEmits<{
  (e: 'update:modelValue', valor: boolean): void;
  (e: 'confirmar'): void;
}>();
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="420"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="lg">
      <v-card-title>{{ titulo }}</v-card-title>
      <v-card-text>{{ mensagem }}</v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="emit('update:modelValue', false)">Cancelar</v-btn>
        <v-btn color="error" variant="flat" @click="emit('confirmar')">{{ textoConfirmar }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
