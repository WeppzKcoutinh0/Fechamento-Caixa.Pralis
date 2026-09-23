<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Caixa, Turno } from '~/types/fechamento';
import { hojeISO } from '~/types/fechamento';
import { formatCents } from '~/utils/financeiro';
import { formatarDataBr } from '~/utils/vendasFechamento';
import { usePerfil } from '~/composables/usePerfil';
import { useSessaoCaixa } from '~/composables/useSessaoCaixa';
import {
  useTransferenciasTesouraria,
  type TransferenciaTesouraria,
} from '~/composables/useTransferenciasTesouraria';
import CampoDinheiro from '~/components/comum/CampoDinheiro.vue';

const modelValue = defineModel<boolean>({ default: false });

const { perfil } = usePerfil();
const { abrirSessao, erro, carregando } = useSessaoCaixa();
const { buscarPorLacre } = useTransferenciasTesouraria();

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

// Conferência de fundo (pedido do usuário, 23/09/2026): ao sair do campo de lacre, busca a
// transferência cadastrada na Tesouraria pra esse lacre e mostra o valor em notas/moedas que o
// ADMIN registrou, pro operador conferir contra o que tem fisicamente no caixa. Diferente do
// lookup silencioso que já existe lá no wizard de fechamento (useRelatorioCalculado.ts) — aqui
// precisa ser visível e bloquear "Abrir Caixa" até o operador escolher Confirmar/Não confirmar,
// porque é sobre o fundo físico que ele está recebendo agora, não sobre o cálculo do fechamento.
const transferenciaEncontrada = ref<TransferenciaTesouraria | null>(null);
const buscandoLacre = ref(false);
const fundoConfirmado = ref<boolean | null>(null);
const notasContadasCents = ref(0);
const moedasContadasCents = ref(0);

async function buscarLacre(): Promise<void> {
  const lacre = lacreAbertura.value.trim();
  fundoConfirmado.value = null;
  notasContadasCents.value = 0;
  moedasContadasCents.value = 0;
  if (!lacre) {
    transferenciaEncontrada.value = null;
    return;
  }
  buscandoLacre.value = true;
  try {
    transferenciaEncontrada.value = await buscarPorLacre(lacre);
  } catch {
    // Lookup é só uma ajuda visual — se falhar, o operador ainda consegue abrir o caixa
    // normalmente (mesmo espírito do lookup silencioso do wizard).
    transferenciaEncontrada.value = null;
  } finally {
    buscandoLacre.value = false;
  }
}

function escolherConfirmado(valor: boolean): void {
  fundoConfirmado.value = valor;
  if (valor) {
    notasContadasCents.value = 0;
    moedasContadasCents.value = 0;
  }
}

// "Abrir Caixa" só fica travado quando HÁ algo pra conferir (lacre encontrado) e o operador ainda
// não escolheu uma das duas opções — sem lacre encontrado, abre normal, como já era antes.
const conferenciaPendente = computed(
  () => !!transferenciaEncontrada.value && fundoConfirmado.value === null,
);

const CAIXAS_OPCOES = ['Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4'] as const;
const TURNOS_OPCOES = ['Manhã', 'Tarde'] as const;

// Enum fixo das 5 maquininhas físicas da loja (pedido do usuário, 22/09/2026) — só visual/
// informativo, igual já era com o campo de texto livre: não dispara nenhuma busca, não muda
// nenhum cálculo. Corrigido "MQA" -> "MAQ" no último item (mesmo padrão dos outros 4).
const MAQUININHAS_OPCOES: string[] = [
  'MAQ.cx1-J9D109390816',
  'MAQ.cx2-1733604190',
  'MAQ.cx3-1733604129',
  'MAQ.cx4-J9D509650278',
  'MAQ.cx-entrega-J9BB07901119',
];

async function confirmar(): Promise<void> {
  if (!caixaSelecionado.value || !turnoSelecionado.value || conferenciaPendente.value) return;
  const resultado = await abrirSessao({
    caixa: caixaSelecionado.value,
    turno: turnoSelecionado.value,
    lacreAbertura: lacreAbertura.value,
    maquininhaAbertura: maquininhaAbertura.value,
    fundoConfirmado: transferenciaEncontrada.value ? fundoConfirmado.value : null,
    fundoValorNotasContado: notasContadasCents.value,
    fundoValorMoedasContado: moedasContadasCents.value,
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
          hint="Identifica o lacre do malote que trouxe o fundo ao caixa — se já estiver cadastrado na Tesouraria, o valor aparece sozinho em Transferências Automáticas. Não é o lacre usado no fechamento."
          persistent-hint
          :loading="buscandoLacre"
          @blur="buscarLacre"
        />

        <div v-if="transferenciaEncontrada" class="conferencia-fundo">
          <p class="text-caption font-weight-bold mb-2">
            Confira o fundo recebido contra o que a Tesouraria cadastrou pra este lacre:
          </p>
          <div class="d-flex ga-4 mb-3">
            <div>
              <span class="text-caption text-medium-emphasis d-block">Valor em Notas</span>
              <strong>R$ {{ formatCents(transferenciaEncontrada.valorNotasCents) }}</strong>
            </div>
            <div>
              <span class="text-caption text-medium-emphasis d-block">Valor em Moedas</span>
              <strong>R$ {{ formatCents(transferenciaEncontrada.valorMoedasCents) }}</strong>
            </div>
          </div>

          <div class="d-flex ga-2 mb-2">
            <v-btn
              size="small"
              :variant="fundoConfirmado === true ? 'flat' : 'outlined'"
              :color="fundoConfirmado === true ? 'success' : undefined"
              @click="escolherConfirmado(true)"
            >
              Confirmar
            </v-btn>
            <v-btn
              size="small"
              :variant="fundoConfirmado === false ? 'flat' : 'outlined'"
              :color="fundoConfirmado === false ? 'warning' : undefined"
              @click="escolherConfirmado(false)"
            >
              Não confirmar
            </v-btn>
          </div>

          <p v-if="conferenciaPendente" class="text-caption text-error mb-0">
            Escolha Confirmar ou Não confirmar pra poder abrir o caixa.
          </p>

          <div v-if="fundoConfirmado === false" class="d-flex flex-column ga-3 mt-2">
            <p class="text-caption text-medium-emphasis mb-0">
              Digite o que você contou de verdade no caixa — isso vira uma pendência pro
              administrador revisar, sem mudar nada no cálculo do fechamento.
            </p>
            <div class="d-flex ga-3">
              <CampoDinheiro v-model="notasContadasCents" label="Notas contadas" />
              <CampoDinheiro v-model="moedasContadasCents" label="Moedas contadas" />
            </div>
          </div>
        </div>
        <v-select
          v-model="maquininhaAbertura"
          :items="MAQUININHAS_OPCOES"
          label="Maq. Cartão / N° Série"
          clearable
        />
        <v-text-field
          :model-value="formatarDataBr(hojeISO())"
          label="Data de abertura"
          readonly
          prepend-inner-icon="mdi-clock-outline"
        />
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
          :disabled="!caixaSelecionado || !turnoSelecionado || conferenciaPendente"
          @click="confirmar"
        >
          Abrir Caixa
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.conferencia-fundo {
  margin-top: calc(var(--cx-sp-3) * -1);
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border: 1px dashed var(--cx-line);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-sunken);
}
</style>
