<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import FormularioTransferenciaTesouraria from '~/components/tesouraria/FormularioTransferenciaTesouraria.vue';
import ConfirmacaoDialog from '~/components/comum/ConfirmacaoDialog.vue';
import { usePerfil } from '~/composables/usePerfil';
import {
  useTransferenciasTesouraria,
  type TransferenciaTesouraria,
} from '~/composables/useTransferenciasTesouraria';
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

// Pedido do usuário (18/09/2026): recebimentos pendentes saem da lista principal por completo e
// só aparecem dentro do sininho de notificações — a lista principal mostra só o que já foi
// confirmado. Ao confirmar pelo sininho, o item sai da notificação e passa a aparecer aqui.
const pendentes = computed(() => transferencias.value.filter((t) => !t.dataRecebimento));
const confirmadas = computed(() => transferencias.value.filter((t) => !!t.dataRecebimento));
const notificacoesAbertas = ref(false);

const CONTAS_CENTRAIS = new Set(['Cofre', 'Caixa Principal', 'Caixa de Troco', 'Fluxo']);

function ehRetorno(t: TransferenciaTesouraria): boolean {
  return (
    t.transferenciaRetorno ||
    t.lacre.toUpperCase().startsWith('RETORNO-') ||
    /retorno|sangria/i.test(t.observacao)
  );
}

function ehTransferenciaEntreContas(t: TransferenciaTesouraria): boolean {
  return CONTAS_CENTRAIS.has(t.caixaOrigem) || CONTAS_CENTRAIS.has(t.caixaDestino);
}

const gruposTransferencias = computed(() => [
  {
    id: 'lacres',
    titulo: 'Lacres criados pela Tesouraria',
    descricao: 'Transferências cadastradas pela Tesouraria para abastecer ou movimentar os caixas.',
    icone: 'mdi-ticket-confirmation-outline',
    itens: confirmadas.value.filter((t) => !ehRetorno(t) && !ehTransferenciaEntreContas(t)),
  },
  {
    id: 'retornos',
    titulo: 'Retornos dos caixas para o Cofre Fluxo',
    descricao: 'Valores devolvidos automaticamente pelos caixas após o fechamento.',
    icone: 'mdi-backup-restore',
    itens: confirmadas.value.filter(ehRetorno),
  },
  {
    id: 'contas',
    titulo: 'Transferências entre contas',
    descricao: 'Movimentações entre Cofre Principal, Cofre Troco, Cofre Fluxo e outras contas.',
    icone: 'mdi-swap-horizontal-bold',
    itens: confirmadas.value.filter((t) => !ehRetorno(t) && ehTransferenciaEntreContas(t)),
  },
]);

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

        <v-menu v-model="notificacoesAbertas" location="bottom end" :close-on-content-click="false">
          <template #activator="{ props: menuProps }">
            <v-btn v-bind="menuProps" icon variant="text" aria-label="Recebimentos pendentes">
              <v-badge v-if="pendentes.length" :content="pendentes.length" color="warning" floating>
                <v-icon icon="mdi-bell-outline" />
              </v-badge>
              <v-icon v-else icon="mdi-bell-outline" />
            </v-btn>
          </template>
          <v-card min-width="340" max-width="420" rounded="lg">
            <v-card-title class="text-subtitle-1">Recebimentos pendentes</v-card-title>
            <v-divider />
            <v-list v-if="pendentes.length" density="comfortable" class="py-0">
              <v-list-item v-for="t in pendentes" :key="t.id" class="py-3">
                <div class="d-flex flex-column ga-1">
                  <div class="d-flex align-center ga-2">
                    <strong>{{ t.caixaOrigem }} → {{ t.caixaDestino }}</strong>
                    <v-spacer />
                    <strong>R$ {{ formatCents(t.valorCents) }}</strong>
                  </div>
                  <span class="text-caption text-medium-emphasis"
                    >Lacre {{ t.lacre }} · {{ formatarDataBr(t.dataLanc) }}</span
                  >
                  <v-btn
                    size="small"
                    variant="tonal"
                    color="success"
                    class="mt-1"
                    :loading="confirmando === t.id"
                    @click="confirmarRecebimentoDe(t.id)"
                  >
                    Confirmar recebimento
                  </v-btn>
                </div>
              </v-list-item>
            </v-list>
            <v-card-text v-else class="text-body-2 text-medium-emphasis">
              Nenhum recebimento pendente.
            </v-card-text>
          </v-card>
        </v-menu>

        <v-btn color="primary" prepend-icon="mdi-plus" @click="modalAberto = true"
          >Nova Transferência</v-btn
        >
      </div>

      <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

      <div v-if="carregando" class="d-flex justify-center py-6">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <v-alert v-else-if="confirmadas.length === 0" type="info" variant="tonal">
        Nenhuma transferência confirmada ainda.
      </v-alert>

      <v-expansion-panels v-else variant="accordion" class="transferencia-grupos">
        <v-expansion-panel v-for="grupo in gruposTransferencias" :key="grupo.id" rounded="lg">
          <v-expansion-panel-title>
            <v-icon :icon="grupo.icone" color="primary" class="mr-3" />
            <div class="flex-grow-1">
              <strong>{{ grupo.titulo }}</strong>
              <div class="text-caption text-medium-emphasis">{{ grupo.descricao }}</div>
            </div>
            <v-chip size="small" variant="tonal" color="primary" class="mr-2">
              {{ grupo.itens.length }}
            </v-chip>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-alert v-if="!grupo.itens.length" type="info" variant="tonal" density="compact">
              Nenhum registro nesta categoria.
            </v-alert>
            <div v-else class="d-flex flex-column ga-2">
              <v-card v-for="t in grupo.itens" :key="t.id" variant="outlined" rounded="lg" class="pa-4">
                <div class="d-flex align-center flex-wrap ga-3">
                  <v-icon icon="mdi-check-circle" color="success" size="20" />
                  <strong>{{ t.caixaOrigem }} → {{ t.caixaDestino }}</strong>
                  <span class="text-caption text-medium-emphasis">Lacre {{ t.lacre }}</span>
                  <span class="text-caption text-medium-emphasis">{{ formatarDataBr(t.dataLanc) }}</span>
                  <v-spacer />
                  <strong>R$ {{ formatCents(t.valorCents) }}</strong>
                  <v-btn
                    size="small"
                    variant="text"
                    color="error"
                    icon="mdi-delete-outline"
                    aria-label="Excluir transferência"
                    @click="paraExcluir = t.id"
                  />
                </div>
                <p v-if="t.observacao" class="text-caption text-medium-emphasis mt-2 mb-0">
                  {{ t.observacao }}
                </p>
              </v-card>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

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
