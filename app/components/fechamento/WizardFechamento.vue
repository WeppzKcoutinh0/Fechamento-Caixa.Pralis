<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useFechamentoForm } from '~/composables/useFechamentoForm';
import { useFechamentos } from '~/composables/useFechamentos';
import SecaoIdentificacao from '~/components/fechamento/SecaoIdentificacao.vue';
import SecaoTransferencias from '~/components/fechamento/SecaoTransferencias.vue';
import SecaoLancamentos from '~/components/fechamento/SecaoLancamentos.vue';
import SecaoRelatorios from '~/components/fechamento/SecaoRelatorios.vue';
import SecaoRelatorioFinal from '~/components/fechamento/SecaoRelatorioFinal.vue';
import AppCabecalhoTela from '~/components/app/AppCabecalhoTela.vue';
import EtapasWizard from '~/components/fechamento/EtapasWizard.vue';

defineProps<{ titulo: string }>();

const {
  draft,
  secaoAtual,
  totalSecoes,
  progressoPct,
  progressoLabel,
  mostrarVoltar,
  mostrarAvancar,
  mostrarSalvar,
  avancar,
  voltar,
  irPara,
} = useFechamentoForm();
const { salvar } = useFechamentos();
const router = useRouter();

const salvando = ref(false);
const erro = ref<string | null>(null);

const TITULOS_SECAO = [
  'Identificação',
  'Transferências',
  'Lançamentos',
  'Relatórios',
  'Relatório Final',
] as const;

const tituloSecao = computed(() => TITULOS_SECAO[secaoAtual.value - 1] ?? TITULOS_SECAO[0]);

async function onSalvar() {
  erro.value = null;
  salvando.value = true;
  try {
    await salvar(draft.value);
    await router.push('/');
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível salvar o fechamento.';
  } finally {
    salvando.value = false;
  }
}
</script>

<template>
  <v-container class="py-6" style="max-width: 900px">
    <AppCabecalhoTela :titulo="titulo" />

    <!-- <900px: barra de progresso + pontos (comportamento original, já testado em 390px).
         >=900px: some daqui e a EtapasWizard assume — ver <style>. -->
    <v-progress-linear
      :model-value="progressoPct"
      color="primary"
      height="6"
      rounded
      class="mb-2 progresso-mobile"
    />
    <div class="d-flex justify-space-between align-center mb-5 progresso-mobile">
      <span class="text-caption text-medium-emphasis">{{ progressoLabel }}</span>
      <div class="d-flex ga-1">
        <span
          v-for="n in totalSecoes"
          :key="n"
          :style="{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background:
              n === secaoAtual
                ? 'rgb(var(--v-theme-primary))'
                : 'rgb(var(--v-theme-surface-variant))',
            display: 'inline-block',
          }"
        />
      </div>
    </div>

    <div class="wizard-corpo">
      <aside class="wizard-lateral">
        <EtapasWizard :etapas="TITULOS_SECAO" :etapa-atual="secaoAtual" @ir-para="irPara" />
      </aside>

      <div class="wizard-conteudo">
        <v-card class="pa-5 mb-5" rounded="lg" variant="outlined">
          <h2 class="text-subtitle-1 mb-4">{{ tituloSecao }}</h2>

          <SecaoIdentificacao v-if="secaoAtual === 1" :draft="draft" />
          <SecaoTransferencias v-else-if="secaoAtual === 2" :draft="draft" />
          <SecaoLancamentos v-else-if="secaoAtual === 3" :draft="draft" />
          <SecaoRelatorios v-else-if="secaoAtual === 4" :draft="draft" />
          <SecaoRelatorioFinal v-else-if="secaoAtual === 5" :draft="draft" />
        </v-card>

        <v-alert
          v-if="erro"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-4"
          role="alert"
          aria-live="assertive"
          >{{ erro }}</v-alert
        >

        <div class="d-flex justify-space-between">
          <v-btn v-if="mostrarVoltar" variant="text" @click="voltar">Voltar</v-btn>
          <v-spacer />
          <v-btn v-if="mostrarAvancar" color="primary" @click="avancar">Avançar</v-btn>
          <v-btn v-if="mostrarSalvar" color="primary" :loading="salvando" @click="onSalvar"
            >Salvar</v-btn
          >
        </div>
      </div>
    </div>
  </v-container>
</template>

<style scoped>
.wizard-lateral {
  display: none;
}

@media (width >= 900px) {
  /* !important: a div do rótulo+pontos também tem `d-flex` do Vuetify, que já é
     `display: flex !important` — sem isto o utilitário vencia o display:none. */
  .progresso-mobile {
    display: none !important;
  }
  .wizard-corpo {
    display: flex;
    align-items: flex-start;
    gap: var(--cx-sp-6);
  }
  .wizard-lateral {
    display: block;
    flex: 0 0 220px;
    /* Acompanha a rolagem da tela dentro da área visível — útil num formulário longo,
       sem exigir posição fixa que colidiria com o cabeçalho em telas baixas. */
    position: sticky;
    top: var(--cx-sp-6);
  }
  .wizard-conteudo {
    flex: 1 1 auto;
    min-width: 0;
  }
}
</style>
