<script setup lang="ts">
import BotaoModoEscuro from '~/components/app/BotaoModoEscuro.vue';

withDefaults(defineProps<{ titulo: string; voltarPara?: string }>(), { voltarPara: '/' });
</script>

<template>
  <div class="d-flex align-center ga-3 mb-4">
    <v-btn
      icon="mdi-arrow-left"
      variant="text"
      density="comfortable"
      :to="voltarPara"
      aria-label="Voltar"
    />
    <h1 class="text-h6">{{ titulo }}</h1>
    <v-spacer />
    <slot name="acoes" />
    <BotaoModoEscuro />
  </div>
</template>
