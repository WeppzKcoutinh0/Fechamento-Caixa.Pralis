<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Caixa, Turno } from '~/types/fechamento';
import { CAIXAS, hojeISO } from '~/types/fechamento';
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
const { buscarPorLacre, validarLacre } = useTransferenciasTesouraria();

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
// Lacre precisa bater com um cadastro real da Tesouraria pra hoje (mudança pedida pelo usuário,
// 30/09/2026: "usuários de caixa não poderem criar lacres, colocar qualquer numero no campo") —
// deixou de bastar digitar qualquer texto não vazio. `transferenciaEncontrada` (achado no blur,
// ver buscarLacre abaixo) é a prova de que o número existe — sem ela, "Abrir Caixa" fica travado.
const lacreValido = computed(() => !!transferenciaEncontrada.value);

// Conferência de fundo (pedido do usuário, 23/09/2026): ao sair do campo de lacre, busca a
// transferência cadastrada na Tesouraria pra esse lacre e mostra o valor em notas/moedas que o
// ADMIN registrou, pro operador conferir contra o que tem fisicamente no caixa. Este lookup
// continua sem consumir (consumir: false) — é só a conferência visual; o "uso" de verdade (marca
// lacre_usado_em, uso único) só acontece em confirmar() abaixo, no exato momento de abrir o caixa
// pra valer, não a cada vez que o campo perde o foco.
const transferenciaEncontrada = ref<TransferenciaTesouraria | null>(null);
const buscandoLacre = ref(false);
const jaBuscouLacre = ref(false);
const lacreForaDoCaixa = ref(false);
const fundoConfirmado = ref<boolean | null>(null);
const notasContadasCents = ref(0);
const moedasContadasCents = ref(0);
const erroConsumoLacre = ref<string | null>(null);
const consumindoLacre = ref(false);

// Mostra "lacre não encontrado" só depois de uma busca de verdade (nunca no campo ainda vazio) —
// evita mostrar erro antes do operador terminar de digitar.
const lacreNaoEncontrado = computed(
  () =>
    jaBuscouLacre.value &&
    !buscandoLacre.value &&
    !transferenciaEncontrada.value &&
    lacreAbertura.value.trim().length > 0,
);

async function buscarLacre(): Promise<void> {
  const lacre = lacreAbertura.value.trim();
  fundoConfirmado.value = null;
  notasContadasCents.value = 0;
  moedasContadasCents.value = 0;
  erroConsumoLacre.value = null;
  lacreForaDoCaixa.value = false;
  if (!lacre) {
    transferenciaEncontrada.value = null;
    jaBuscouLacre.value = false;
    return;
  }
  buscandoLacre.value = true;
  try {
    // consumir: false — só ajuda visual, não "usa" o lacre ainda (ver comentário acima).
    const transferencia = await buscarPorLacre(lacre, hojeISO());
    if (transferencia && caixaSelecionado.value && turnoSelecionado.value) {
      const pertenceAoCaixa = await validarLacre(
        lacre,
        'inicial',
        hojeISO(),
        caixaSelecionado.value,
        turnoSelecionado.value,
      );
      lacreForaDoCaixa.value = !pertenceAoCaixa;
      transferenciaEncontrada.value = pertenceAoCaixa ? transferencia : null;
    } else {
      transferenciaEncontrada.value = transferencia;
    }
  } catch {
    transferenciaEncontrada.value = null;
  } finally {
    jaBuscouLacre.value = true;
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

// Uso único (pedido do usuário, 30/09/2026): "assim que usou e fechou o caixa também não pode
// colocá-lo novamente" — o lacre é marcado usado (lacre_usado_em) NESTE clique, atomicamente
// (buscar_transferencia_tesouraria_por_lacre com p_consumir=true só atualiza se ainda não tiver
// dono — ver 20260928140000_lacre_valido_so_na_data.sql), nunca antes. Reaproveita o mesmo número
// noutro dia continua permitido — a trava é por (lacre, data), não pelo número sozinho.
async function confirmar(): Promise<void> {
  if (
    !caixaSelecionado.value ||
    !turnoSelecionado.value ||
    !lacreValido.value ||
    conferenciaPendente.value
  )
    return;
  erroConsumoLacre.value = null;
  consumindoLacre.value = true;
  try {
    const pertenceAoCaixa = await validarLacre(
      lacreAbertura.value,
      'inicial',
      hojeISO(),
      caixaSelecionado.value,
      turnoSelecionado.value,
    );
    if (!pertenceAoCaixa) {
      transferenciaEncontrada.value = null;
      lacreForaDoCaixa.value = true;
      erroConsumoLacre.value =
        'Este lacre inicial não está cadastrado para este caixa, turno e data.';
      consumindoLacre.value = false;
      return;
    }
  } catch {
    erroConsumoLacre.value = 'Não foi possível conferir o lacre inicial agora. Tente novamente.';
    consumindoLacre.value = false;
    return;
  }
  let consumido: TransferenciaTesouraria | null;
  try {
    consumido = await buscarPorLacre(lacreAbertura.value, hojeISO(), { consumir: true });
  } catch {
    erroConsumoLacre.value = 'Não foi possível confirmar o lacre. Tente novamente.';
    consumindoLacre.value = false;
    return;
  }
  consumindoLacre.value = false;
  if (!consumido) {
    // Outro caixa pode ter usado o mesmo lacre entre o blur e este clique — o achado do blur
    // (transferenciaEncontrada) fica obsoleto, força reconferência.
    transferenciaEncontrada.value = null;
    jaBuscouLacre.value = true;
    erroConsumoLacre.value =
      'Este lacre já foi usado por outro caixa ou não é mais válido para hoje. Confira o número ou peça um novo à administração.';
    return;
  }
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
          :items="[...CAIXAS]"
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
          :rules="[(valor: string) => Boolean(valor?.trim()) || 'Informe o número do lacre.']"
          required
          label="Transf. Entrada / N° Lacre"
          hint="Precisa ser um lacre cadastrado pela administração na Tesouraria para hoje — uso único, não dá pra digitar um número qualquer nem reusar um lacre já utilizado."
          persistent-hint
          :loading="buscandoLacre"
          @blur="buscarLacre"
        />

        <v-alert v-if="lacreNaoEncontrado" type="warning" variant="tonal" density="comfortable">
          Nenhum lacre cadastrado com esse número para hoje. Confira o número ou peça pra
          administração cadastrar na Tesouraria.
        </v-alert>

        <v-alert v-if="lacreForaDoCaixa" type="warning" variant="tonal" density="comfortable">
          Este lacre inicial nao esta cadastrado para este caixa, turno e data.
        </v-alert>

        <v-alert v-if="erroConsumoLacre" type="error" variant="tonal" density="comfortable">
          {{ erroConsumoLacre }}
        </v-alert>

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
          :loading="carregando || consumindoLacre"
          :disabled="!caixaSelecionado || !turnoSelecionado || !lacreValido || conferenciaPendente"
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
