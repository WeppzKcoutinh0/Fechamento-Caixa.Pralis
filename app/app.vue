<script setup lang="ts">
import { useModoEscuro } from '~/composables/useModoEscuro';

const { inicializar } = useModoEscuro();
onMounted(inicializar);
</script>

<template>
  <v-app>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </v-app>
</template>
