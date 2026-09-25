<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useFechamentos } from '~/composables/useFechamentos';
import ConfirmacaoDialog from '~/components/comum/ConfirmacaoDialog.vue';
import PainelResumo from '~/components/app/PainelResumo.vue';
import { formatCents } from '~/utils/financeiro';
import { draftDoRegistroAntigo, lerRegistrosAntigos } from '~/utils/importadorAntigo';
import { calcularResumoPainel } from '~/utils/painel';
import { hojeISO } from '~/types/fechamento';
import type { FechamentoListItem } from '~/types/fechamento';
import { mensagemDeErro } from '~/utils/erros';

const { listar, excluir, salvar } = useFechamentos();
const router = useRouter();

const carregando = ref(true);
const erro = ref<string | null>(null);
const fechamentos = ref<FechamentoListItem[]>([]);
const termoBusca = ref('');
const excluindoId = ref<string | null>(null);

async function carregar() {
  carregando.value = true;
  erro.value = null;
  try {
    fechamentos.value = await listar();
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível carregar os fechamentos.');
  } finally {
    carregando.value = false;
  }
}
onMounted(carregar);

// Importador único do localStorage antigo (decisão do plano) — só aparece se existir a chave
// antiga neste navegador e o usuário ainda não importou/dispensou.
const CHAVE_DISPENSADO = 'fechamentos_caixa_importado';
const registrosAntigos = ref<ReturnType<typeof lerRegistrosAntigos>>([]);
const importando = ref(false);
const erroImportacao = ref<string | null>(null);

onMounted(() => {
  if (localStorage.getItem(CHAVE_DISPENSADO)) return;
  registrosAntigos.value = lerRegistrosAntigos();
});

async function importarAntigos() {
  importando.value = true;
  erroImportacao.value = null;
  try {
    for (const registro of registrosAntigos.value) {
      await salvar(draftDoRegistroAntigo(registro));
    }
    localStorage.setItem(CHAVE_DISPENSADO, 'true');
    registrosAntigos.value = [];
    await carregar();
  } catch (e) {
    erroImportacao.value = mensagemDeErro(e, 'Não foi possível importar.');
  } finally {
    importando.value = false;
  }
}
function dispensarImportacao() {
  localStorage.setItem(CHAVE_DISPENSADO, 'true');
  registrosAntigos.value = [];
}

// normalizarBusca/textoBuscaRegistro atuais, ampliado pra cobrir entradas/sangrias/discriminações
// (hoje fora da busca — correção de bug do plano).
// Faixa Unicode dos acentos combináveis (mesma faixa usada pelo app atual).
const DIACRITICOS = new RegExp('[̀-ͯ]', 'g');
function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .toLowerCase()
    .trim();
}
function textoBusca(f: FechamentoListItem): string {
  return normalizar(
    [
      f.codigo,
      f.data,
      formatarDataBR(f.data),
      f.caixa,
      f.turno,
      f.responsavel,
      f.valorTotalFinalCents,
      f.diferencaCents,
      ...f.entradas.flatMap((e) => [e.lacre, e.descricao]),
      ...f.sangrias.flatMap((s) => [s.lacre, s.descricao]),
      ...f.transferenciasCaixa.flatMap((t) => [t.caixaOrigem, t.caixaDestino, t.lacre]),
      ...f.lancamentos.flatMap((l) => [l.tipo, l.status, l.fornecedor, l.valorCents]),
      ...f.discriminacoes.map((d) => d.produto),
      ...f.crediario.flatMap((c) => [c.tipo, c.nome, c.valorCents]),
    ].join(' '),
  );
}
function formatarDataBR(data: string): string {
  if (!data) return '—';
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}

const filtrados = computed(() => {
  const termo = normalizar(termoBusca.value);
  if (!termo) return fechamentos.value;
  return fechamentos.value.filter((f) => textoBusca(f).includes(termo));
});

const resumoPainel = computed(() => calcularResumoPainel(fechamentos.value, hojeISO()));

function statusDiferenca(cents: number): { classe: string; texto: string } {
  if (Math.abs(cents) < 1) return { classe: 'zero', texto: '= Zero' };
  if (cents > 0) return { classe: 'positivo', texto: `↑ R$ ${formatCents(cents)}` };
  return { classe: 'negativo', texto: `↓ R$ ${formatCents(Math.abs(cents))}` };
}

function abrirVer(id: string) {
  router.push(`/fechamentos/${id}/ver`);
}
function abrirEditar(id: string) {
  router.push(`/fechamentos/${id}`);
}
function pedirExclusao(id: string) {
  excluindoId.value = id;
}
async function confirmarExclusao() {
  if (!excluindoId.value) return;
  erro.value = null;
  try {
    await excluir(excluindoId.value);
    excluindoId.value = null;
    await carregar();
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível excluir o fechamento.');
  }
}
</script>

<template>
  <v-container class="py-6" style="max-width: 1100px">
    <h1 class="text-h5 mb-6">Bem-vindo</h1>

    <PainelResumo :resumo="resumoPainel" class="mb-7" />

    <h2 class="text-subtitle-1 font-weight-bold mb-3">Fechamentos</h2>
    <div class="d-flex ga-3 mb-5 flex-wrap">
      <v-text-field
        v-model="termoBusca"
        label="Pesquisar fechamentos"
        prepend-inner-icon="mdi-magnify"
        density="comfortable"
        style="max-width: 320px"
        clearable
      />
    </div>

    <v-alert
      v-if="registrosAntigos.length > 0"
      type="info"
      variant="tonal"
      class="mb-4"
      closable
      @click:close="dispensarImportacao"
    >
      <div class="d-flex align-center flex-wrap ga-3">
        <span
          >Encontrei {{ registrosAntigos.length }} fechamento{{
            registrosAntigos.length > 1 ? 's' : ''
          }}
          salvo{{ registrosAntigos.length > 1 ? 's' : '' }} neste navegador (versão antiga). Quer
          importar pro banco?</span
        >
        <v-btn size="small" color="primary" :loading="importando" @click="importarAntigos"
          >Importar</v-btn
        >
      </div>
      <div v-if="erroImportacao" class="text-caption text-error mt-2">{{ erroImportacao }}</div>
    </v-alert>

    <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

    <div v-if="carregando" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-alert v-else-if="filtrados.length === 0" type="info" variant="tonal">
      {{
        fechamentos.length === 0
          ? 'Nenhum fechamento registrado ainda.'
          : 'Nenhum resultado encontrado.'
      }}
    </v-alert>

    <div v-else class="deck-grid">
      <v-card
        v-for="f in filtrados"
        :key="f.id"
        variant="outlined"
        rounded="lg"
        class="pa-4"
        style="cursor: pointer"
        @click="abrirVer(f.id)"
      >
        <div class="d-flex align-center ga-3 mb-3">
          <v-avatar color="primary" variant="tonal"><v-icon icon="mdi-point-of-sale" /></v-avatar>
          <div class="flex-grow-1" style="min-width: 0">
            <div class="text-subtitle-2 text-truncate">
              {{ f.responsavel || 'Sem responsável' }}
            </div>
            <div class="text-caption text-medium-emphasis text-truncate">{{ f.codigo }}</div>
          </div>
        </div>

        <div class="d-flex flex-column ga-1 mb-3">
          <div class="d-flex justify-space-between text-body-2">
            <span class="text-medium-emphasis">Data</span>
            <strong>{{ formatarDataBR(f.data) }}</strong>
          </div>
          <div class="d-flex justify-space-between text-body-2">
            <span class="text-medium-emphasis">Caixa / Turno</span>
            <strong>{{ f.caixa || 'Caixa' }} - {{ f.turno || '-' }}</strong>
          </div>
          <div class="d-flex justify-space-between text-body-2">
            <span class="text-medium-emphasis">Valor Total Final</span>
            <strong>R$ {{ formatCents(f.valorTotalFinalCents) }}</strong>
          </div>
          <div class="d-flex justify-space-between text-body-2">
            <span class="text-medium-emphasis">Diferença</span>
            <strong
              :class="{
                'text-success': statusDiferenca(f.diferencaCents).classe === 'positivo',
                'text-error': statusDiferenca(f.diferencaCents).classe === 'negativo',
              }"
              >{{ statusDiferenca(f.diferencaCents).texto }}</strong
            >
          </div>
        </div>

        <div class="d-flex ga-1" @click.stop>
          <v-btn size="small" variant="text" prepend-icon="mdi-eye" @click="abrirVer(f.id)"
            >Ver</v-btn
          >
          <v-btn size="small" variant="text" prepend-icon="mdi-pencil" @click="abrirEditar(f.id)"
            >Editar</v-btn
          >
          <v-btn
            size="small"
            variant="text"
            color="error"
            prepend-icon="mdi-delete-outline"
            @click="pedirExclusao(f.id)"
          >
            Excluir
          </v-btn>
        </div>
      </v-card>
    </div>

    <ConfirmacaoDialog
      :model-value="!!excluindoId"
      titulo="Excluir Fechamento?"
      mensagem="Esta ação não pode ser desfeita."
      texto-confirmar="Excluir"
      @update:model-value="excluindoId = null"
      @confirmar="confirmarExclusao"
    />
  </v-container>
</template>

<style scoped>
.deck-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
</style>
