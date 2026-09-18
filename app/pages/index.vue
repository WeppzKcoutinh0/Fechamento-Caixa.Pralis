<script setup lang="ts">
import { onMounted } from 'vue';
import { usePerfil } from '~/composables/usePerfil';
import PainelAdmin from '~/components/app/PainelAdmin.vue';
import PainelCaixaOperacional from '~/components/app/PainelCaixaOperacional.vue';

const { perfil, carregando, isAdmin, carregar } = usePerfil();
onMounted(carregar);
</script>

<template>
  <div v-if="carregando && !perfil" class="d-flex justify-center py-10">
    <v-progress-circular indeterminate color="primary" />
  </div>
  <PainelAdmin v-else-if="isAdmin" />
  <PainelCaixaOperacional v-else />
</template>
