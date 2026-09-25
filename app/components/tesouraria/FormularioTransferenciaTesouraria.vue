<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { CAIXAS, hojeISO } from '~/types/fechamento';
import {
  useTransferenciasTesouraria,
  type CaixaOuCofre,
  type DestinoExtra,
} from '~/composables/useTransferenciasTesouraria';
import CampoDinheiro from '~/components/comum/CampoDinheiro.vue';

const modelValue = defineModel<boolean>({ default: false });
const emit = defineEmits<{ criada: [] }>();

const { criar } = useTransferenciasTesouraria();

const OPCOES_CAIXA: CaixaOuCofre[] = [
  'Cofre',
  'Caixa Principal',
  'Caixa de Troco',
  'Fluxo',
  ...CAIXAS,
];

function rotuloCaixa(valor: CaixaOuCofre): string {
  if (valor === 'Caixa Principal') return 'Cofre Principal';
  if (valor === 'Caixa de Troco') return 'Cofre Troco';
  if (valor === 'Fluxo') return 'Cofre Fluxo';
  return valor;
}

// Notas/Moedas (pedido do usuário, 23/09/2026): decomposição do fundo de caixa que o operador vai
// conferir fisicamente na abertura (ver FormularioAbrirCaixa.vue). Valor total agora é SEMPRE a
// soma automática dos dois (pedido do usuário, 23/09/2026 — revendo a decisão inicial de campos
// independentes), mesmo padrão de SecaoRelatorioFinal.vue.
const valorCents = ref(0);
const valorNotasCents = ref(0);
const valorMoedasCents = ref(0);
function aoAlterarNotas(cents: number): void {
  valorNotasCents.value = cents;
  valorCents.value = cents + valorMoedasCents.value;
}
function aoAlterarMoedas(cents: number): void {
  valorMoedasCents.value = cents;
  valorCents.value = valorNotasCents.value + cents;
}
const lacre = ref('');
const dataLanc = ref(hojeISO());
const agendamento = ref(false);
const caixaOrigem = ref<CaixaOuCofre | null>(null);
const caixaDestino = ref<CaixaOuCofre | null>(null);
const multiploDestino = ref(false);
const destinosExtra = ref<DestinoExtra[]>([]);
const tempoConfirmacao = ref(false);
const transferenciaRetorno = ref(false);
const observacao = ref('');
const erro = ref<string | null>(null);
const salvando = ref(false);

const opcoesDestino = computed(() => OPCOES_CAIXA.filter((c) => c !== caixaOrigem.value));
const opcoesDestinoExtra = computed(() =>
  OPCOES_CAIXA.filter((c) => c !== caixaOrigem.value && c !== caixaDestino.value),
);

// "Transferência de retorno" só faz sentido Cofre -> um PDV específico (mesma regra do
// formulário de referência que o usuário mostrou) — sem isso, "retorno pra onde?" não tem resposta.
const retornoDisponivel = computed(
  () => caixaOrigem.value === 'Cofre' && !!caixaDestino.value && caixaDestino.value !== 'Cofre',
);
watch(retornoDisponivel, (disponivel) => {
  if (!disponivel) transferenciaRetorno.value = false;
});

watch([caixaOrigem, caixaDestino], () => {
  destinosExtra.value = destinosExtra.value.filter((d) =>
    opcoesDestinoExtra.value.includes(d.caixa),
  );
});

function adicionarDestinoExtra(): void {
  const primeiraDisponivel = opcoesDestinoExtra.value[0];
  if (primeiraDisponivel) destinosExtra.value.push({ caixa: primeiraDisponivel });
}
function removerDestinoExtra(indice: number): void {
  destinosExtra.value.splice(indice, 1);
}

function resetar(): void {
  valorCents.value = 0;
  valorNotasCents.value = 0;
  valorMoedasCents.value = 0;
  lacre.value = '';
  dataLanc.value = hojeISO();
  agendamento.value = false;
  caixaOrigem.value = null;
  caixaDestino.value = null;
  multiploDestino.value = false;
  destinosExtra.value = [];
  tempoConfirmacao.value = false;
  transferenciaRetorno.value = false;
  observacao.value = '';
  erro.value = null;
}

// Soma dos destinos extras tem que bater com o Valor total (pedido do usuário, 18/09/2026) —
// sem isso o dinheiro "sobra ou falta" silenciosamente entre os destinos.
const valido = computed(
  () =>
    valorCents.value > 0 &&
    !!lacre.value.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(dataLanc.value) &&
    !!caixaOrigem.value &&
    !!caixaDestino.value,
);

// 25/09/2026 (bug real reportado pelo usuário): clicar em Salvar com o formulário incompleto
// não fazia NADA — sem mensagem nenhuma, parecia que o botão tinha travado. Agora mostra o que
// falta preencher em vez de silenciosamente não salvar.
function mensagemFaltando(): string | null {
  if (valorCents.value <= 0) return 'Informe o valor da transferência (Notas + Moedas).';
  if (!lacre.value.trim()) return 'Informe o N° Lacre / Doc.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataLanc.value)) return 'Informe a data do lançamento.';
  if (!caixaOrigem.value) return 'Selecione a Origem / Saída.';
  if (!caixaDestino.value) return 'Selecione o Destino / Entrada.';
  return null;
}

async function salvar(criarNova: boolean): Promise<void> {
  if (!valido.value || !caixaOrigem.value || !caixaDestino.value) {
    erro.value = mensagemFaltando();
    return;
  }
  erro.value = null;
  salvando.value = true;
  try {
    await criar({
      valorCents: valorCents.value,
      valorNotasCents: valorNotasCents.value,
      valorMoedasCents: valorMoedasCents.value,
      lacre: lacre.value,
      dataLanc: dataLanc.value,
      agendamento: agendamento.value,
      caixaOrigem: caixaOrigem.value,
      caixaDestino: caixaDestino.value,
      multiploDestino: multiploDestino.value,
      destinosExtra: multiploDestino.value ? destinosExtra.value : [],
      tempoConfirmacao: tempoConfirmacao.value,
      transferenciaRetorno: transferenciaRetorno.value,
      observacao: observacao.value,
    });
    emit('criada');
    if (criarNova) {
      resetar();
    } else {
      modelValue.value = false;
    }
  } catch (e) {
    erro.value =
      e instanceof Error && e.message.includes('duplicate')
        ? `Já existe uma transferência com o lacre "${lacre.value}".`
        : e instanceof Error
          ? e.message
          : 'Não foi possível salvar a transferência.';
  } finally {
    salvando.value = false;
  }
}

watch(modelValue, (aberto) => {
  if (aberto) resetar();
});
</script>

<template>
  <v-dialog v-model="modelValue" max-width="560" scrollable>
    <v-card rounded="lg">
      <v-card-title class="d-flex align-center ga-2">
        <v-icon icon="mdi-swap-horizontal" />
        Nova transferência
      </v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <div class="d-flex flex-column flex-sm-row ga-3">
          <CampoDinheiro
            :model-value="valorNotasCents"
            label="Valor em Notas"
            @update:model-value="aoAlterarNotas"
          />
          <CampoDinheiro
            :model-value="valorMoedasCents"
            label="Valor em Moedas"
            @update:model-value="aoAlterarMoedas"
          />
        </div>
        <CampoDinheiro :model-value="valorCents" label="Valor" readonly />
        <p class="text-caption text-medium-emphasis mt-n2 mb-0">
          O Valor total é a soma de Notas + Moedas — usado também na conferência de fundo quando o
          caixa abre com este lacre.
        </p>

        <div class="d-flex flex-column flex-sm-row ga-3">
          <v-text-field
            v-model="lacre"
            class="lacre-field"
            label="N° Lacre / Doc"
            placeholder="Ex.: 000123"
            required
          />
          <v-text-field
            v-model="dataLanc"
            class="data-lanc-field"
            type="date"
            label="Data Lanç."
            required
          />
        </div>

        <div class="d-flex flex-column flex-sm-row ga-3">
          <v-select
            v-model="caixaOrigem"
            :items="OPCOES_CAIXA"
            :item-title="rotuloCaixa"
            label="Origem / Saída"
            placeholder="Selecione..."
          />
          <v-select
            v-model="caixaDestino"
            :items="opcoesDestino"
            :item-title="rotuloCaixa"
            label="Destino / Entrada"
            placeholder="Selecione..."
          />
        </div>

        <v-checkbox v-model="agendamento" label="Agendamento" density="compact" hide-details />
        <v-text-field
          v-if="agendamento"
          model-value="—"
          label="Data Recebimento"
          readonly
          hint="Preenchido quando confirmado pelo destinatário."
          persistent-hint
        />

        <v-checkbox
          v-model="multiploDestino"
          label="Múltiplo Destino"
          density="compact"
          hide-details
        />
        <div v-if="multiploDestino" class="d-flex flex-column ga-2">
          <div v-for="(destino, i) in destinosExtra" :key="i" class="d-flex ga-2 align-center">
            <v-select
              v-model="destino.caixa"
              :items="opcoesDestinoExtra"
              :item-title="rotuloCaixa"
              label="Caixa candidata"
              density="compact"
              hide-details
              style="max-width: 220px"
            />
            <v-btn
              icon="mdi-delete-outline"
              variant="text"
              size="small"
              @click="removerDestinoExtra(i)"
            />
          </div>
          <v-btn variant="text" size="small" prepend-icon="mdi-plus" @click="adicionarDestinoExtra"
            >Adicionar destino</v-btn
          >
          <p class="text-caption text-medium-emphasis mb-0">
            Os destinos são candidatos à confirmação. O valor inteiro da transferência permanece o
            mesmo.
          </p>
        </div>

        <v-checkbox
          v-model="tempoConfirmacao"
          label="Tempo de confirmação"
          density="compact"
          hide-details
        />

        <v-checkbox
          v-model="transferenciaRetorno"
          label="Transferência de retorno"
          density="compact"
          hide-details
          :disabled="!retornoDisponivel"
        />
        <p v-if="!retornoDisponivel" class="text-caption text-medium-emphasis mt-n2 mb-0">
          Selecione Cofre como origem e uma conta de PDV ativa como destino para preparar o retorno.
        </p>

        <v-textarea
          v-model="observacao"
          label="Observação"
          rows="2"
          placeholder="Ex.: Suprimento CX1 — reforço de troco"
        />

        <v-alert v-if="erro" type="error" variant="tonal" density="comfortable">{{ erro }}</v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="modelValue = false">Cancelar</v-btn>
        <v-btn variant="text" :loading="salvando" :disabled="!valido" @click="salvar(true)"
          >Salvar e criar nova</v-btn
        >
        <v-btn color="primary" :loading="salvando" :disabled="!valido" @click="salvar(false)"
          >Salvar</v-btn
        >
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
@media (min-width: 600px) {
  .lacre-field,
  .data-lanc-field {
    flex: 1 1 0;
    width: 0;
    min-width: 0;
  }
}
</style>
