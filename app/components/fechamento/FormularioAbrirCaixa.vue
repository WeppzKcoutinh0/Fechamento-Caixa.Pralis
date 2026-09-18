<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Caixa, Turno } from '~/types/fechamento';
import { hojeISO } from '~/types/fechamento';
import { formatarDataBr } from '~/utils/vendasFechamento';
import { usePerfil } from '~/composables/usePerfil';
import { useSessaoCaixa } from '~/composables/useSessaoCaixa';

const modelValue = defineModel<boolean>({ default: false });

const { perfil } = usePerfil();
const { abrirSessao, erro, carregando } = useSessaoCaixa();

// Caixa/Turno travados no valor cadastrado da conta (pedido do usuário, 18/09/2026) — cada uma
// das 8 contas operacionais só abre o caixa/turno que já é dela (`profiles.caixa_padrao`/
// `turno_padrao`, preenchidos pelo script de provisionamento). Sem cadastro (ex.: admin abrindo
// na mão), cai pra seleção livre.
//
// `caixaTravado`/`turnoTravado` são `computed`, e a pré-seleção vem de um `watch` com
// `immediate: true` (não um `ref()` inicializado uma vez só) — achado real (18/09/2026): este
// componente já nasce montado dentro de `PainelCaixaOperacional.vue` antes de `usePerfil()`
// terminar de buscar o perfil (busca assíncrona disparada no `onMounted` de `pages/index.vue`).
// Um `ref(perfil.value?.caixaPadrao)` captura `null` nesse instante e nunca mais atualiza — o
// select fica vazio, o botão "Abrir Caixa" fica desabilitado (sem erro visível), e a abertura
// trava silenciosamente. Reativo aos dois (perfil chegando a qualquer momento) resolve de vez.
const caixaTravado = computed(() => !!perfil.value?.caixaPadrao);
const turnoTravado = computed(() => !!perfil.value?.turnoPadrao);
const caixaSelecionado = ref<Caixa | null>(null);
const turnoSelecionado = ref<Turno | null>(null);
watch(
  perfil,
  (p) => {
    if (p?.caixaPadrao) caixaSelecionado.value = p.caixaPadrao as Caixa;
    if (p?.turnoPadrao) turnoSelecionado.value = p.turnoPadrao as Turno;
  },
  { immediate: true },
);
const lacreAbertura = ref('');
const maquininhaAbertura = ref('');

const CAIXAS_OPCOES = ['Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4'] as const;
const TURNOS_OPCOES = ['Manhã', 'Tarde'] as const;

async function confirmar(): Promise<void> {
  if (!caixaSelecionado.value || !turnoSelecionado.value) return;
  const resultado = await abrirSessao({
    caixa: caixaSelecionado.value,
    turno: turnoSelecionado.value,
    lacreAbertura: lacreAbertura.value,
    maquininhaAbertura: maquininhaAbertura.value,
  });
  if (resultado) {
    modelValue.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="modelValue" max-width="480">
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-point-of-sale" />
        Abrir Caixa
      </v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <v-select
          v-model="caixaSelecionado"
          :items="[...CAIXAS_OPCOES]"
          label="Ponto de Venda"
          :readonly="caixaTravado"
          :hint="caixaTravado ? 'Travado — esta conta é dedicada a este caixa.' : undefined"
          persistent-hint
        />
        <v-select
          v-model="turnoSelecionado"
          :items="[...TURNOS_OPCOES]"
          label="Turno"
          :readonly="turnoTravado"
          :hint="turnoTravado ? 'Travado — esta conta é dedicada a este turno.' : undefined"
          persistent-hint
        />
        <v-text-field
          v-model="lacreAbertura"
          label="Transf. Entrada / N° Lacre"
          hint="Identifica o lacre do malote que trouxe o fundo ao caixa. Não é o lacre usado no fechamento."
          persistent-hint
        />
        <v-text-field v-model="maquininhaAbertura" label="Maq. Cartão / N° Série" />
        <v-text-field :model-value="formatarDataBr(hojeISO())" label="Data de abertura" readonly prepend-inner-icon="mdi-clock-outline" />
        <v-text-field :model-value="perfil?.nome ?? ''" label="Usuário do caixa" readonly />

        <v-alert v-if="erro" type="error" variant="tonal" density="comfortable">{{ erro }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="modelValue = false">Cancelar</v-btn>
        <v-btn
          color="primary"
          prepend-icon="mdi-point-of-sale"
          :loading="carregando"
          :disabled="!caixaSelecionado || !turnoSelecionado"
          @click="confirmar"
        >
          Abrir Caixa
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
