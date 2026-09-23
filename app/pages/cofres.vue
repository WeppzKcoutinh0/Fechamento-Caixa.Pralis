<script setup lang="ts">
// Cofres centrais (pedido do usuário, 23/09/2026): Caixa Principal, Caixa de Troco e Fluxo —
// ciclo descrito pelo usuário: CAIXA PRINCIPAL → CAIXA DE TROCO → CAIXAS/FLUXO → CONFERÊNCIA →
// (parte fica no Fluxo, parte volta pro Principal) → recomeça. Três conceitos NOVOS,
// independentes do "Cofre" genérico que já existia (decisão explícita do usuário).
//
// Saldo de cada cofre é sempre CALCULADO (soma de entradas − saídas em transferencias_tesouraria)
// — não existe campo de saldo gravado em lugar nenhum, mesmo espírito de nunca confiar num campo
// espelho já documentado em useFechamentos.ts.
import { onMounted, ref } from 'vue';
import {
  useTransferenciasTesouraria,
  COFRES_CENTRAIS,
  type CofreCentral,
  type TransferenciaTesouraria,
} from '~/composables/useTransferenciasTesouraria';
import { useCofreNotas, type CofreNota } from '~/composables/useCofreNotas';
import { formatCents } from '~/utils/financeiro';
import { formatarDataBr } from '~/utils/vendasFechamento';
import AppCabecalhoTela from '~/components/app/AppCabecalhoTela.vue';

definePageMeta({ middleware: ['admin'] });

const ICONE_COFRE: Record<CofreCentral, string> = {
  'Caixa Principal': 'mdi-safe-square-outline',
  'Caixa de Troco': 'mdi-cash-multiple',
  Fluxo: 'mdi-swap-horizontal-bold',
};
const DESCRICAO_COFRE: Record<CofreCentral, string> = {
  'Caixa Principal':
    'Guarda o dinheiro principal da loja. Não faz pagamentos — só armazena e transfere pro Troco ou Financeiro.',
  'Caixa de Troco': 'Recebe do Principal e distribui/movimenta dinheiro pros outros caixas.',
  Fluxo:
    'Dinheiro circulando nos malotes/caixas. Depois da conferência, parte fica aqui e parte volta pro Principal.',
};

const { listar, confirmarRecebimento } = useTransferenciasTesouraria();
const { listar: listarNotas, adicionar: adicionarNota, remover: removerNota } = useCofreNotas();

const carregando = ref(true);
const erro = ref<string | null>(null);
const transferencias = ref<TransferenciaTesouraria[]>([]);
const confirmandoId = ref<string | null>(null);

async function carregar(): Promise<void> {
  carregando.value = true;
  erro.value = null;
  try {
    transferencias.value = await listar();
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível carregar os cofres.';
  } finally {
    carregando.value = false;
  }
}
onMounted(async () => {
  await carregar();
  // Só 3 cofres — carrega as anotações de todos de uma vez em vez de depender de detectar o
  // evento certo de expandir cada v-expansion-panel individualmente.
  await Promise.all(COFRES_CENTRAIS.map((cofre) => aoAbrirCofre(cofre)));
});

function movimentacoesDe(cofre: CofreCentral): TransferenciaTesouraria[] {
  return transferencias.value
    .filter((t) => t.caixaOrigem === cofre || t.caixaDestino === cofre)
    .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
}
function saldoDe(cofre: CofreCentral): number {
  return transferencias.value.reduce((soma, t) => {
    if (t.caixaDestino === cofre) return soma + t.valorCents;
    if (t.caixaOrigem === cofre) return soma - t.valorCents;
    return soma;
  }, 0);
}
function pendentesDe(cofre: CofreCentral): TransferenciaTesouraria[] {
  return transferencias.value.filter((t) => t.caixaDestino === cofre && !t.dataRecebimento);
}

async function confirmar(t: TransferenciaTesouraria): Promise<void> {
  confirmandoId.value = t.id;
  try {
    await confirmarRecebimento(t.id);
    await carregar();
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível confirmar o recebimento.';
  } finally {
    confirmandoId.value = null;
  }
}

// Anotações — carregadas só quando o painel do cofre abre pela primeira vez (mesmo padrão de
// carregamento sob demanda de useVendasProdutoDia em SecaoRelatorioFinal.vue).
const notasPorCofre = ref<Record<CofreCentral, CofreNota[]>>({
  'Caixa Principal': [],
  'Caixa de Troco': [],
  Fluxo: [],
});
const notasCarregadas = ref<Record<CofreCentral, boolean>>({
  'Caixa Principal': false,
  'Caixa de Troco': false,
  Fluxo: false,
});
const novaNotaTexto = ref<Record<CofreCentral, string>>({
  'Caixa Principal': '',
  'Caixa de Troco': '',
  Fluxo: '',
});
const salvandoNota = ref<CofreCentral | null>(null);

async function aoAbrirCofre(cofre: CofreCentral): Promise<void> {
  if (notasCarregadas.value[cofre]) return;
  notasCarregadas.value[cofre] = true;
  try {
    notasPorCofre.value[cofre] = await listarNotas(cofre);
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível carregar as anotações.';
  }
}
async function salvarNota(cofre: CofreCentral): Promise<void> {
  const texto = novaNotaTexto.value[cofre].trim();
  if (!texto) return;
  salvandoNota.value = cofre;
  try {
    await adicionarNota(cofre, texto);
    novaNotaTexto.value[cofre] = '';
    notasPorCofre.value[cofre] = await listarNotas(cofre);
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível salvar a anotação.';
  } finally {
    salvandoNota.value = null;
  }
}
async function excluirNota(cofre: CofreCentral, id: string): Promise<void> {
  try {
    await removerNota(id);
    notasPorCofre.value[cofre] = notasPorCofre.value[cofre].filter((n) => n.id !== id);
  } catch (e) {
    erro.value = e instanceof Error ? e.message : 'Não foi possível excluir a anotação.';
  }
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
</script>

<template>
  <v-container class="py-6" style="max-width: 900px">
    <AppCabecalhoTela titulo="Cofres" />
    <p class="text-body-2 text-medium-emphasis mb-5">
      Caixa Principal → Caixa de Troco → Caixas/Fluxo → Conferência → parte volta pro Principal, o
      resto fica no Fluxo. Clique num cofre pra ver saldo, pendências, histórico e anotar.
    </p>

    <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

    <div v-if="carregando" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-expansion-panels v-else variant="accordion" class="cat-accordion">
      <v-expansion-panel
        v-for="cofre in COFRES_CENTRAIS"
        :key="cofre"
        class="cat-painel"
        :style="{ '--cat': 'var(--cx-brand)', '--cat-soft': 'var(--cx-brand-wash)', '--cat-tinta': 'var(--cx-brand-text)' }"
      >
        <v-expansion-panel-title class="cat-titulo">
          <v-icon size="18" class="mr-2">{{ ICONE_COFRE[cofre] }}</v-icon>
          <span class="flex-grow-1 cat-titulo-rotulo">{{ cofre }}</span>
          <strong class="cat-valor">R$ {{ formatCents(saldoDe(cofre)) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="text-caption text-medium-emphasis">{{ DESCRICAO_COFRE[cofre] }}</p>

          <!-- Pendentes de confirmação -->
          <div v-if="pendentesDe(cofre).length" class="mb-4">
            <p class="text-caption font-weight-bold mb-2">Aguardando confirmação de recebimento</p>
            <div class="d-flex flex-column ga-2">
              <div
                v-for="t in pendentesDe(cofre)"
                :key="t.id"
                class="d-flex align-center flex-wrap ga-2 pa-2 pendencia-item"
              >
                <span class="text-caption">{{ t.caixaOrigem }} → {{ cofre }}</span>
                <span class="text-caption text-medium-emphasis">Lacre {{ t.lacre }}</span>
                <span class="text-caption text-medium-emphasis">{{ formatarDataBr(t.dataLanc) }}</span>
                <strong class="text-caption">R$ {{ formatCents(t.valorCents) }}</strong>
                <v-spacer />
                <v-btn
                  size="x-small"
                  variant="tonal"
                  color="success"
                  :loading="confirmandoId === t.id"
                  @click="confirmar(t)"
                >
                  Confirmar
                </v-btn>
              </div>
            </div>
          </div>

          <!-- Anotações -->
          <p class="text-caption font-weight-bold mb-2">Anotações</p>
          <div class="d-flex ga-2 mb-3">
            <v-text-field
              v-model="novaNotaTexto[cofre]"
              density="compact"
              placeholder="Ex.: Contei e bate certinho hoje"
              hide-details
              @keyup.enter="salvarNota(cofre)"
            />
            <v-btn
              size="small"
              variant="tonal"
              color="primary"
              :loading="salvandoNota === cofre"
              :disabled="!novaNotaTexto[cofre].trim()"
              @click="salvarNota(cofre)"
            >
              Anotar
            </v-btn>
          </div>
          <div v-if="notasPorCofre[cofre].length" class="d-flex flex-column ga-2 mb-4">
            <div
              v-for="nota in notasPorCofre[cofre]"
              :key="nota.id"
              class="d-flex align-start ga-2 pa-2 nota-item"
            >
              <div class="flex-grow-1">
                <p class="text-body-2 mb-0">{{ nota.texto }}</p>
                <span class="text-caption text-medium-emphasis"
                  >{{ nota.criadoPorNome }} · {{ formatarDataHora(nota.criadoEm) }}</span
                >
              </div>
              <v-icon size="16" class="excluir-nota" @click="excluirNota(cofre, nota.id)"
                >mdi-close</v-icon
              >
            </div>
          </div>
          <p v-else class="text-caption text-medium-emphasis mb-4">Nenhuma anotação ainda.</p>

          <!-- Histórico -->
          <p class="text-caption font-weight-bold mb-2">Movimentações</p>
          <div v-if="movimentacoesDe(cofre).length" class="d-flex flex-column ga-2">
            <div
              v-for="t in movimentacoesDe(cofre)"
              :key="t.id"
              class="d-flex align-center flex-wrap ga-2 pa-2 movimentacao-item"
            >
              <v-icon size="16" :color="t.caixaDestino === cofre ? 'success' : 'error'">
                {{ t.caixaDestino === cofre ? 'mdi-arrow-bottom-left' : 'mdi-arrow-top-right' }}
              </v-icon>
              <span class="text-caption">
                {{ t.caixaDestino === cofre ? t.caixaOrigem : t.caixaDestino }}
              </span>
              <span class="text-caption text-medium-emphasis">Lacre {{ t.lacre }}</span>
              <span class="text-caption text-medium-emphasis">{{ formatarDataBr(t.dataLanc) }}</span>
              <v-spacer />
              <strong class="text-caption">R$ {{ formatCents(t.valorCents) }}</strong>
            </div>
          </div>
          <p v-else class="text-caption text-medium-emphasis mb-0">Nenhuma movimentação ainda.</p>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </v-container>
</template>

<style scoped>
.pendencia-item {
  border-radius: var(--cx-r-md);
  background: var(--cx-warning-wash, var(--cx-surface-sunken));
}
.nota-item,
.movimentacao-item {
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}
.excluir-nota {
  cursor: pointer;
  opacity: 0.5;
}
.excluir-nota:hover {
  opacity: 1;
}
</style>
