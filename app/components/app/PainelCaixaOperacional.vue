<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSessaoCaixa } from '~/composables/useSessaoCaixa';
import FormularioAbrirCaixa from '~/components/fechamento/FormularioAbrirCaixa.vue';

const router = useRouter();
const { sessaoAtual, carregando, carregarSessaoAtual } = useSessaoCaixa();

onMounted(carregarSessaoAtual);

const modalAberto = ref(false);

const horaAbertura = computed(() => {
  if (!sessaoAtual.value) return '';
  return new Date(sessaoAtual.value.openedAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
});

function irParaWizard(): void {
  router.push('/fechamentos/novo');
}
</script>

<template>
  <v-container
    class="py-6 d-flex flex-column align-center justify-center"
    style="max-width: 640px; min-height: 60vh"
  >
    <div v-if="carregando" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else-if="sessaoAtual">
      <!-- Cartão inteiro é o clique (pedido do usuário, 18/09/2026): abre o caixa -> fica aqui
           mostrando o caixa aberto -> só entra no formulário quando o operador toca NELE, não
           logo depois de abrir. -->
      <v-card
        rounded="lg"
        variant="outlined"
        class="pa-6 text-center caixa-aberto-card"
        width="100%"
        role="button"
        tabindex="0"
        @click="irParaWizard"
        @keyup.enter="irParaWizard"
      >
        <v-avatar color="success" variant="tonal" size="56" class="mb-4">
          <v-icon icon="mdi-point-of-sale" size="28" />
        </v-avatar>
        <div class="text-h6 mb-1">{{ sessaoAtual.caixa }} · {{ sessaoAtual.turno }}</div>
        <div class="text-body-2 text-medium-emphasis mb-4">Aberto às {{ horaAbertura }}</div>
        <div class="d-flex align-center justify-center ga-1 text-primary font-weight-medium">
          <v-icon icon="mdi-file-document-edit-outline" size="18" />
          Toque para continuar o fechamento
          <v-icon icon="mdi-chevron-right" size="18" />
        </div>
      </v-card>
    </template>

    <template v-else>
      <div class="text-center mb-6">
        <v-avatar color="primary" variant="tonal" size="64" class="mb-4">
          <v-icon icon="mdi-point-of-sale" size="32" />
        </v-avatar>
        <div class="text-h6 mb-1">Nenhum caixa aberto</div>
        <div class="text-body-2 text-medium-emphasis">
          Abra o caixa para começar o fechamento de hoje.
        </div>
      </div>
      <v-btn
        color="primary"
        size="large"
        prepend-icon="mdi-lock-open-variant"
        @click="modalAberto = true"
      >
        Abrir Caixa
      </v-btn>
    </template>

    <!-- Sem handler de "aberta" pra navegação automática (pedido do usuário): depois de abrir, o
         modal só fecha e o painel mostra o cartão de "caixa aberto" acima — o operador decide
         quando entrar no formulário clicando nele, não é levado pra lá na hora. -->
    <FormularioAbrirCaixa v-model="modalAberto" />
  </v-container>
</template>

<style scoped>
.caixa-aberto-card {
  cursor: pointer;
}
</style>
