<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { hojeISO } from '~/types/fechamento';
import { formatarDataBr } from '~/utils/vendasFechamento';
import {
  useTransferenciasTesouraria,
  type CaixaOuCofre,
  type DestinoExtra,
} from '~/composables/useTransferenciasTesouraria';
import CampoDinheiro from '~/components/comum/CampoDinheiro.vue';

const modelValue = defineModel<boolean>({ default: false });
const emit = defineEmits<{ criada: [] }>();

const { criar } = useTransferenciasTesouraria();

const OPCOES_CAIXA: CaixaOuCofre[] = ['Cofre', 'Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4'];

const valorCents = ref(0);
// Notas/Moedas (pedido do usuário, 23/09/2026): decomposição do fundo de caixa que o operador vai
// conferir fisicamente na abertura (ver FormularioAbrirCaixa.vue). Campos independentes do "Valor"
// de propósito — decisão explícita do usuário de não validar que a soma bate com o total.
const valorNotasCents = ref(0);
const valorMoedasCents = ref(0);
const lacre = ref('');
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
  () => valorCents.value > 0 && !!lacre.value.trim() && !!caixaOrigem.value && !!caixaDestino.value,
);

async function salvar(criarNova: boolean): Promise<void> {
  if (!valido.value || !caixaOrigem.value || !caixaDestino.value) return;
  erro.value = null;
  salvando.value = true;
  try {
    await criar({
      valorCents: valorCents.value,
      valorNotasCents: valorNotasCents.value,
      valorMoedasCents: valorMoedasCents.value,
      lacre: lacre.value,
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
        <CampoDinheiro v-model="valorCents" label="Valor" required />

        <div class="d-flex flex-column flex-sm-row ga-3">
          <CampoDinheiro v-model="valorNotasCents" label="Valor em Notas" />
          <CampoDinheiro v-model="valorMoedasCents" label="Valor em Moedas" />
        </div>
        <p class="text-caption text-medium-emphasis mt-n2 mb-0">
          Usado na conferência de fundo quando o caixa abre com este lacre — não precisa bater com
          o Valor total acima.
        </p>

        <div class="d-flex flex-column flex-sm-row ga-3">
          <v-text-field v-model="lacre" label="N° Lacre / Doc" placeholder="Ex.: 000123" required />
          <v-text-field :model-value="formatarDataBr(hojeISO())" label="Data Lanç." readonly />
        </div>

        <div class="d-flex flex-column flex-sm-row ga-3">
          <v-select
            v-model="caixaOrigem"
            :items="OPCOES_CAIXA"
            label="Origem / Saída"
            placeholder="Selecione..."
          />
          <v-select
            v-model="caixaDestino"
            :items="opcoesDestino"
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
