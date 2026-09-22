<script setup lang="ts">
import { onMounted } from 'vue';
import { usePerfil } from '~/composables/usePerfil';
import PainelAdmin from '~/components/app/PainelAdmin.vue';
import PainelCaixaOperacional from '~/components/app/PainelCaixaOperacional.vue';

const { perfil, carregando, erro: erroPerfil, isAdmin, carregar } = usePerfil();
onMounted(carregar);
</script>

<template>
  <div v-if="carregando && !perfil" class="d-flex justify-center py-10">
    <v-progress-circular indeterminate color="primary" />
  </div>
  <PainelAdmin v-else-if="isAdmin" />
  <PainelCaixaOperacional v-else-if="perfil" />
  <v-container v-else class="py-6" style="max-width: 640px">
    <v-alert type="error" variant="tonal">
      {{
        erroPerfil ||
        'Seu usuário ainda não possui um perfil operacional configurado. Procure o administrador.'
      }}
    </v-alert>
  </v-container>
</template>
