<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ConsultaPorPeriodo from '~/components/consulta/ConsultaPorPeriodo.vue';
import FormularioTransferenciaTesouraria from '~/components/tesouraria/FormularioTransferenciaTesouraria.vue';
import ConfirmacaoDialog from '~/components/comum/ConfirmacaoDialog.vue';
import { usePerfil } from '~/composables/usePerfil';
import { useTransferenciasTesouraria, type TransferenciaTesouraria } from '~/composables/useTransferenciasTesouraria';
import { formatCents } from '~/utils/financeiro';
import { formatarDataBr } from '~/utils/vendasFechamento';

const { isAdmin, carregar: carregarPerfil } = usePerfil();
const { listar, excluir, confirmarRecebimento } = useTransferenciasTesouraria();
const confirmando = ref<string | null>(null);

const carregando = ref(true);
const erro = ref<string | null>(null);
const transferencias = ref<TransferenciaTesouraria[]>([]);
const modalAberto = ref(false);
const paraExcluir = ref<string | null>(null);

async function carregar(): Promise<void> {
  carregando.value = true;
  erro.value = null;
  try {
    transferencias.value = await listar();
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível carregar as transferências.';
  } finally {
    carregando.value = false;
  }
}
// Achado real (18/09/2026): sem isto, chegar direto nesta página (bookmark/recarregar, sem vir
// clicando a partir de `/`) nunca resolvia `isAdmin` — `usePerfil()` só carrega quando algo chama
// `carregar()`, e nenhuma outra página nessa cadeia fazia isso.
onMounted(async () => {
  await carregarPerfil();
  if (isAdmin.value) await carregar();
});

function statusDe(t: TransferenciaTesouraria): { texto: string; cor: string } {
  if (t.dataRecebimento) return { texto: 'Confirmada', cor: 'success' };
  if (t.agendamento) return { texto: 'Agendada', cor: 'warning' };
  if (t.tempoConfirmacao) return { texto: 'Aguardando confirmação', cor: 'warning' };
  return { texto: 'Confirmada', cor: 'success' };
}

async function confirmarExclusao(): Promise<void> {
  if (!paraExcluir.value) return;
  await excluir(paraExcluir.value);
  paraExcluir.value = null;
  await carregar();
}

async function confirmarRecebimentoDe(id: string): Promise<void> {
  confirmando.value = id;
  try {
    await confirmarRecebimento(id);
    await carregar();
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível confirmar o recebimento.';
  } finally {
    confirmando.value = null;
  }
}
</script>

<template>
  <v-container class="py-6" style="max-width: 900px">
    <div v-if="isAdmin" class="mb-8">
      <div class="d-flex align-center ga-2 mb-6 flex-wrap">
        <span class="consulta-disco"><v-icon icon="mdi-safe-square-outline" size="20" /></span>
        <h1 class="text-h5 flex-grow-1">Tesouraria</h1>
        <v-btn color="primary" prepend-icon="mdi-plus" @click="modalAberto = true">Nova Transferência</v-btn>
      </div>

      <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

      <div v-if="carregando" class="d-flex justify-center py-6">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <v-alert v-else-if="transferencias.length === 0" type="info" variant="tonal">
        Nenhuma transferência de tesouraria registrada ainda.
      </v-alert>

      <div v-else class="d-flex flex-column ga-2">
        <v-card v-for="t in transferencias" :key="t.id" variant="outlined" rounded="lg" class="pa-4">
          <div class="d-flex align-center flex-wrap ga-3">
            <v-chip :color="statusDe(t).cor" size="small" variant="tonal">{{ statusDe(t).texto }}</v-chip>
            <strong>{{ t.caixaOrigem }} → {{ t.caixaDestino }}</strong>
            <span class="text-caption text-medium-emphasis">Lacre {{ t.lacre }}</span>
            <span class="text-caption text-medium-emphasis">{{ formatarDataBr(t.dataLanc) }}</span>
            <v-spacer />
            <strong>R$ {{ formatCents(t.valorCents) }}</strong>
            <v-btn
              v-if="!t.dataRecebimento"
              size="small"
              variant="tonal"
              color="success"
              :loading="confirmando === t.id"
              @click="confirmarRecebimentoDe(t.id)"
            >
              Confirmar recebimento
            </v-btn>
            <v-btn size="small" variant="text" color="error" icon="mdi-delete-outline" @click="paraExcluir = t.id" />
          </div>
          <p v-if="t.observacao" class="text-caption text-medium-emphasis mt-2 mb-0">{{ t.observacao }}</p>
        </v-card>
      </div>
    </div>

    <v-divider v-if="isAdmin" class="mb-8" />

    <ConsultaPorPeriodo
      tipo="transferencias"
      titulo="Transferências entre caixas por fechamento"
      icone="mdi-swap-horizontal-bold"
      cor="var(--cat-transferencias-base)"
    />

    <FormularioTransferenciaTesouraria v-model="modalAberto" @criada="carregar" />
    <ConfirmacaoDialog
      :model-value="!!paraExcluir"
      titulo="Excluir transferência?"
      mensagem="Esta ação não pode ser desfeita."
      texto-confirmar="Excluir"
      @update:model-value="paraExcluir = null"
      @confirmar="confirmarExclusao"
    />
  </v-container>
</template>

<style scoped>
.consulta-disco {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--cat-retiradas-base, #1e88e5);
  color: #fff;
}
</style>
