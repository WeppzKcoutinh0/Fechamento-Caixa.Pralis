<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useFechamentoForm } from '~/composables/useFechamentoForm';
import { useFechamentos } from '~/composables/useFechamentos';
import WizardFechamento from '~/components/fechamento/WizardFechamento.vue';
import { mensagemDeErro } from '~/utils/erros';

const route = useRoute();
const { carregarFechamento } = useFechamentoForm();
const { obter } = useFechamentos();

const carregando = ref(true);
const erro = ref<string | null>(null);

onMounted(async () => {
  try {
    const draft = await obter(String(route.params.id));
    carregarFechamento(draft);
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível carregar o fechamento.');
  } finally {
    carregando.value = false;
  }
});
</script>

<template>
  <v-container v-if="carregando" class="py-10 d-flex justify-center">
    <v-progress-circular indeterminate color="primary" />
  </v-container>
  <v-container v-else-if="erro" class="py-10" style="max-width: 640px">
    <v-alert type="error" variant="tonal">{{ erro }}</v-alert>
  </v-container>
  <WizardFechamento v-else titulo="Editar Fechamento" />
</template>
