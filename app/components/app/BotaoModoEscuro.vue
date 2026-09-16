<script setup lang="ts">
import { useModoEscuro } from '~/composables/useModoEscuro';

const { escuro, alternar } = useModoEscuro();
</script>

<template>
  <v-btn
    :icon="escuro ? 'mdi-weather-sunny' : 'mdi-weather-night'"
    variant="text"
    :title="escuro ? 'Tema claro' : 'Tema escuro'"
    :aria-label="escuro ? 'Ativar tema claro' : 'Ativar tema escuro'"
    @click="alternar"
  />
</template>
