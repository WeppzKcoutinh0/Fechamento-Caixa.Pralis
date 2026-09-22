<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  CAIXAS,
  TIPOS_CONTA_ENTRADA,
  type EntradaDraft,
  type FechamentoDraft,
  type SangriaDraft,
  type TransferenciaCaixaDraft,
} from '~/types/fechamento';
import CartaoValor from '~/components/comum/CartaoValor.vue';
import { formatCents } from '~/utils/financeiro';
import { useTransferenciasTesouraria } from '~/composables/useTransferenciasTesouraria';
import { useTransferenciasRecebidas } from '~/composables/useTransferenciasRecebidas';

const props = defineProps<{ draft: FechamentoDraft }>();

// Os três painéis desta seção são "Transferências/Entrada", "Transferências/Saída/Sangria" e
// "Transferências/Entrada/Saída/Entre caixas" (renomeados em 18/09/2026) — pedido do usuário
// (21/09/2026): as três usam a MESMA cor laranja ("transferências", `--cat-transferencias-*`),
// já que as três agora são a mesma família visualmente, não telas separadas por cor própria.
type TipoModal = 'entrada' | 'sangria' | 'transferencia';

const TRANSFERENCIAS_VARS = {
  '--cat': 'var(--cat-transferencias-base)',
  '--cat-soft': 'var(--cat-transferencias-soft)',
  '--cat-faixa': 'var(--cat-transferencias-faixa)',
  '--cat-tinta': 'var(--cat-transferencias-tinta)',
};
const ENTRADA_VARS = TRANSFERENCIAS_VARS;
const SANGRIA_VARS = TRANSFERENCIAS_VARS;
const TRANSFERENCIA_VARS = TRANSFERENCIAS_VARS;

function novaEntrada(): EntradaDraft {
  return { lacre: '', valorCents: 0, descricao: '', tipoConta: '' };
}
function novaSangria(): SangriaDraft {
  return { descricao: '', lacre: '', valorCents: 0 };
}
// Data travada na data do fechamento (pedido do usuário, 18/09/2026) — ver mesma decisão em
// SecaoLancamentos.vue.
function novaTransferencia(): TransferenciaCaixaDraft {
  return {
    caixaOrigem: props.draft.caixa || '',
    caixaDestino: '',
    valorCents: 0,
    lacre: '',
    data: props.draft.data,
    observacao: '',
  };
}

const modalAberto = ref(false);
const tipoModal = ref<TipoModal>('entrada');
const indiceEditando = ref<number | null>(null);

// Busca automática por lacre (pedido do usuário, 18/09/2026): a "tesouraria" (tela
// /transferencias, admin) cadastra um lacre com valor pré-definido — quando o CAIXA digita esse
// MESMO número aqui, o valor da Entrada é preenchido sozinho. Não encontrar não é erro: o usuário
// só digita o valor à mão, como sempre fez.
const { buscarPorLacre } = useTransferenciasTesouraria();
const lacreEncontradoMsg = ref<string | null>(null);
async function aoSairDoLacreEntrada(): Promise<void> {
  if (tipoModal.value !== 'entrada' || indiceEditando.value === null) return;
  const entrada = props.draft.entradas[indiceEditando.value];
  const alvo = entrada?.lacre.trim();
  if (!entrada || !alvo) {
    lacreEncontradoMsg.value = null;
    return;
  }
  try {
    const resultado = await buscarPorLacre(alvo);
    if (resultado) {
      entrada.valorCents = resultado.valorCents;
      lacreEncontradoMsg.value = `Valor preenchido automaticamente: R$ ${formatCents(resultado.valorCents)} (transferência ${resultado.caixaOrigem} → ${resultado.caixaDestino}).`;
    } else {
      lacreEncontradoMsg.value = null;
    }
  } catch {
    lacreEncontradoMsg.value = null;
  }
}

function abrirNovaEntrada(): void {
  props.draft.entradas.push(novaEntrada());
  indiceEditando.value = props.draft.entradas.length - 1;
  tipoModal.value = 'entrada';
  lacreEncontradoMsg.value = null;
  modalAberto.value = true;
}
function abrirEntrada(indice: number): void {
  indiceEditando.value = indice;
  tipoModal.value = 'entrada';
  lacreEncontradoMsg.value = null;
  modalAberto.value = true;
}
function abrirNovaSangria(): void {
  props.draft.sangrias.push(novaSangria());
  indiceEditando.value = props.draft.sangrias.length - 1;
  tipoModal.value = 'sangria';
  modalAberto.value = true;
}
function abrirSangria(indice: number): void {
  indiceEditando.value = indice;
  tipoModal.value = 'sangria';
  modalAberto.value = true;
}
function abrirNovaTransferencia(): void {
  props.draft.transferenciasCaixa.push(novaTransferencia());
  indiceEditando.value = props.draft.transferenciasCaixa.length - 1;
  tipoModal.value = 'transferencia';
  modalAberto.value = true;
}
function abrirTransferencia(indice: number): void {
  indiceEditando.value = indice;
  tipoModal.value = 'transferencia';
  modalAberto.value = true;
}

const itemAtual = computed(() => {
  if (indiceEditando.value === null) return null;
  if (tipoModal.value === 'entrada') return props.draft.entradas[indiceEditando.value];
  if (tipoModal.value === 'sangria') return props.draft.sangrias[indiceEditando.value];
  return props.draft.transferenciasCaixa[indiceEditando.value];
});
const transferenciaAtual = computed(() =>
  tipoModal.value === 'transferencia' && indiceEditando.value !== null
    ? props.draft.transferenciasCaixa[indiceEditando.value]
    : null,
);
const modalVars = computed(() =>
  tipoModal.value === 'entrada'
    ? ENTRADA_VARS
    : tipoModal.value === 'sangria'
      ? SANGRIA_VARS
      : TRANSFERENCIA_VARS,
);

// Origem não pode ser a mesma conta do destino — mesma regra (R-030) do Pralís, só que sem
// múltiplos candidatos: aqui é uma seleção só de cada lado.
const caixasDestinoDisponiveis = computed(() =>
  CAIXAS.filter((c) => c !== transferenciaAtual.value?.caixaOrigem),
);

// "Caixa destino" obrigatório (pedido do usuário, 18/09/2026) — sem isso o registro fica "—" na
// lista, sem indicar pra onde o dinheiro foi. Bloqueia só o "Salvar" (fechar o "X" continua livre,
// pro usuário poder desistir/remover em vez de ficar preso no modal).
const transferenciaSemDestino = computed(
  () => tipoModal.value === 'transferencia' && !transferenciaAtual.value?.caixaDestino,
);
const transferenciaSemOrigem = computed(
  () => tipoModal.value === 'transferencia' && !transferenciaAtual.value?.caixaOrigem,
);
const transferenciaInvalida = computed(
  () => transferenciaSemOrigem.value || transferenciaSemDestino.value,
);

function remover(): void {
  if (indiceEditando.value === null) return;
  if (tipoModal.value === 'entrada') props.draft.entradas.splice(indiceEditando.value, 1);
  else if (tipoModal.value === 'sangria') props.draft.sangrias.splice(indiceEditando.value, 1);
  else props.draft.transferenciasCaixa.splice(indiceEditando.value, 1);
  modalAberto.value = false;
}

function aoDigitarCentavos(valorBruto: string | number | null): number {
  const digitos = String(valorBruto ?? '').replace(/\D/g, '');
  return digitos ? parseInt(digitos, 10) : 0;
}

// calcTotalEntrada / calcTotalSangria atuais — mesma soma, só reativa em vez de recalculada
// manualmente a cada input.
const totalEntradaCents = computed(() =>
  props.draft.entradas.reduce((soma, e) => soma + e.valorCents, 0),
);
const totalSaidaCents = computed(() =>
  props.draft.sangrias.reduce((soma, s) => soma + s.valorCents, 0),
);
const totalTransferenciasCents = computed(() =>
  props.draft.transferenciasCaixa.reduce((soma, t) => soma + t.valorCents, 0),
);

// Transferências Automáticas (pedido do usuário, 21/09/2026): soma das formas de pagamento já
// sincronizadas das vendas (Seção 1 "Buscar vendas" grava em `draft.pdvEntradas`) — só leitura,
// não editável aqui. Deriva do que JÁ está no draft (não faz uma busca nova): `pdvEntradas` já é
// preenchido de forma idempotente por `aplicarResumoAoPrimeiroPdv` (sobrescreve, nunca duplica a
// cada nova busca), então isto nunca soma a mesma venda duas vezes.
type CampoPdv = 'dinheiroCents' | 'creditoCents' | 'debitoCents' | 'pixCents' | 'voucherCents' | 'crediarioCents';
function somaPdv(campo: CampoPdv): number {
  return props.draft.pdvEntradas.reduce((soma, p) => soma + p[campo], 0);
}
// Detalhe por PDV (pedido do usuário, 22/09/2026): clicar num card individual (ex.: VOUCHER)
// expande mostrando quanto cada PDV lançado na Seção 1 contribuiu pro total — mesmo rótulo
// "PDV N" já usado na lista de PDVs (SecaoRelatorios.vue). Com um PDV só (caso mais comum),
// mostra uma linha só, igual ao total do card.
function detalhesPorPdv(campo: CampoPdv): { rotulo: string; valorCents: number }[] {
  return props.draft.pdvEntradas.map((p, i) => ({ rotulo: `PDV ${i + 1}`, valorCents: p[campo] }));
}
// Transferência recebida de outro caixa (pedido do usuário, 21/09/2026): quando outro caixa
// registra "Transferência entre caixas" com este caixa como destino, aparece aqui sozinho — sem
// precisar avisar por fora. Busca via RPC segura (nunca lê o fechamento alheio inteiro, só o
// agregado — ver useTransferenciasRecebidas.ts).
const { recebidas: transferenciasRecebidas, buscarPorData: buscarTransferenciasRecebidas } =
  useTransferenciasRecebidas();
onMounted(() => {
  if (props.draft.data) void buscarTransferenciasRecebidas(props.draft.data);
});

// Lacre de abertura (pedido do usuário, 22/09/2026): o mesmo lookup de Tesouraria que já
// preenchia a Entrada manual quando alguém redigitava o número — buscado sozinho aqui, sem
// precisar que o caixa crie uma Entrada e redigite o lacre que ele já informou ao abrir o caixa.
const valorLacreAbertura = ref(0);
onMounted(async () => {
  if (!props.draft.lacreAbertura) return;
  const resultado = await buscarPorLacre(props.draft.lacreAbertura).catch(() => null);
  valorLacreAbertura.value = resultado?.valorCents ?? 0;
});

const transferenciasAutomaticas = computed(() => [
  { rotulo: 'CREDITO', valorCents: somaPdv('creditoCents'), detalhes: detalhesPorPdv('creditoCents') },
  { rotulo: 'DEBITO', valorCents: somaPdv('debitoCents'), detalhes: detalhesPorPdv('debitoCents') },
  { rotulo: 'PIX', valorCents: somaPdv('pixCents'), detalhes: detalhesPorPdv('pixCents') },
  { rotulo: 'VOUCHER', valorCents: somaPdv('voucherCents'), detalhes: detalhesPorPdv('voucherCents') },
  { rotulo: 'DINHEIRO', valorCents: somaPdv('dinheiroCents'), detalhes: detalhesPorPdv('dinheiroCents') },
  { rotulo: 'CREDIARIO', valorCents: somaPdv('crediarioCents'), detalhes: detalhesPorPdv('crediarioCents') },
  ...(valorLacreAbertura.value > 0
    ? [
        {
          rotulo: 'TRANSFERÊNCIAS DE ENTRADA',
          valorCents: valorLacreAbertura.value,
          detalhes: [{ rotulo: `Lacre ${props.draft.lacreAbertura}`, valorCents: valorLacreAbertura.value }],
        },
      ]
    : []),
  ...transferenciasRecebidas.value.map((r) => ({
    rotulo: r.caixaOrigem.toUpperCase(),
    valorCents: r.valorCents,
    detalhes: [{ rotulo: `Recebido de ${r.caixaOrigem}`, valorCents: r.valorCents }],
  })),
]);
const totalTransferenciasAutomaticasCents = computed(() =>
  transferenciasAutomaticas.value.reduce((soma, item) => soma + item.valorCents, 0),
);
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <p class="lc-grupo-titulo">Transferências Manuais</p>

    <v-expansion-panels variant="accordion" class="cat-accordion">
      <!-- Painel Entradas -->
      <v-expansion-panel class="cat-painel" :style="ENTRADA_VARS">
        <v-expansion-panel-title class="cat-titulo">
          <v-icon size="18" class="mr-2">mdi-arrow-down-bold-circle-outline</v-icon>
          <span class="flex-grow-1 cat-titulo-rotulo">Transferências/<wbr />Entrada</span>
          <strong class="cat-valor">R$ {{ formatCents(totalEntradaCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <button type="button" class="lc-add mb-3" @click="abrirNovaEntrada">
            <v-icon size="14">mdi-plus</v-icon> Adicionar entrada
          </button>

          <button
            v-for="(entrada, idx) in draft.entradas"
            :key="idx"
            type="button"
            class="lc-resumo-item mb-2"
            @click="abrirEntrada(idx)"
          >
            <span class="lc-resumo-ic">
              <v-icon icon="mdi-arrow-down-bold-circle-outline" size="18" />
            </span>
            <span class="lc-resumo-corpo">
              <span class="lc-resumo-titulo">{{ entrada.descricao || 'Sem descrição' }}</span>
              <span class="lc-resumo-valor">R$ {{ formatCents(entrada.valorCents) }}</span>
            </span>
          </button>

          <p v-if="!draft.entradas.length" class="text-caption text-medium-emphasis mb-0">
            Nenhuma entrada lançada ainda.
          </p>
          <div v-else class="grade-cartoes lc-mt">
            <CartaoValor rotulo="Total Entrada" :valor="`R$ ${formatCents(totalEntradaCents)}`" />
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Painel Sangrias -->
      <v-expansion-panel class="cat-painel" :style="SANGRIA_VARS">
        <v-expansion-panel-title class="cat-titulo">
          <v-icon size="18" class="mr-2">mdi-cash-remove</v-icon>
          <span class="flex-grow-1 cat-titulo-rotulo">Transferências/<wbr />Saída/<wbr />Sangria</span>
          <strong class="cat-valor">R$ {{ formatCents(totalSaidaCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <button type="button" class="lc-add mb-3" @click="abrirNovaSangria">
            <v-icon size="14">mdi-plus</v-icon> Adicionar sangria
          </button>

          <button
            v-for="(sangria, idx) in draft.sangrias"
            :key="idx"
            type="button"
            class="lc-resumo-item mb-2"
            @click="abrirSangria(idx)"
          >
            <span class="lc-resumo-ic"><v-icon icon="mdi-cash-remove" size="18" /></span>
            <span class="lc-resumo-corpo">
              <span class="lc-resumo-titulo">{{ sangria.descricao || 'Sem descrição' }}</span>
              <span class="lc-resumo-valor">R$ {{ formatCents(sangria.valorCents) }}</span>
            </span>
          </button>

          <p v-if="!draft.sangrias.length" class="text-caption text-medium-emphasis mb-0">
            Nenhuma sangria lançada ainda.
          </p>
          <div v-else class="grade-cartoes lc-mt">
            <CartaoValor
              rotulo="Total Saída / Sangria"
              :valor="`R$ ${formatCents(totalSaidaCents)}`"
            />
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- Painel Transferência entre caixas -->
      <v-expansion-panel class="cat-painel" :style="TRANSFERENCIA_VARS">
        <v-expansion-panel-title class="cat-titulo">
          <v-icon size="18" class="mr-2">mdi-swap-horizontal</v-icon>
          <span class="flex-grow-1 cat-titulo-rotulo"
            >Transferências/<wbr />Entrada/<wbr />Saída/<wbr />Entre caixas</span
          >
          <strong class="cat-valor">R$ {{ formatCents(totalTransferenciasCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <button type="button" class="lc-add mb-3" @click="abrirNovaTransferencia">
            <v-icon size="14">mdi-plus</v-icon> Adicionar transferência
          </button>

          <button
            v-for="(transferencia, idx) in draft.transferenciasCaixa"
            :key="idx"
            type="button"
            class="lc-resumo-item mb-2"
            @click="abrirTransferencia(idx)"
          >
            <span class="lc-resumo-ic"><v-icon icon="mdi-swap-horizontal" size="18" /></span>
            <span class="lc-resumo-corpo">
              <span class="lc-resumo-titulo">
                {{ transferencia.caixaOrigem || '—' }} → {{ transferencia.caixaDestino || '—' }}
              </span>
              <span class="lc-resumo-valor">R$ {{ formatCents(transferencia.valorCents) }}</span>
            </span>
          </button>

          <p v-if="!draft.transferenciasCaixa.length" class="text-caption text-medium-emphasis mb-0">
            Nenhuma transferência entre caixas lançada ainda.
          </p>
          <div v-else class="grade-cartoes lc-mt">
            <CartaoValor
              rotulo="Total Transferido"
              :valor="`R$ ${formatCents(totalTransferenciasCents)}`"
            />
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <div class="lc-bloco-automatico">
      <p class="lc-grupo-titulo">Transferências Automáticas</p>
      <p class="text-caption text-medium-emphasis mb-0">
        Somado automaticamente a partir das vendas já sincronizadas ("Buscar vendas") e das
        transferências que outros caixas já registraram tendo este como destino — sem edição manual
        aqui.
      </p>
      <v-expansion-panels variant="accordion" class="cat-accordion">
        <v-expansion-panel class="cat-painel" :style="TRANSFERENCIAS_VARS">
          <v-expansion-panel-title class="cat-titulo">
            <span class="flex-grow-1">Transferências Automáticas</span>
            <strong class="cat-valor">R$ {{ formatCents(totalTransferenciasAutomaticasCents) }}</strong>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-expansion-panels variant="accordion" class="cat-subacordeao">
              <v-expansion-panel v-for="item in transferenciasAutomaticas" :key="item.rotulo" class="cat-subitem">
                <v-expansion-panel-title class="cat-subitem-titulo">
                  <span class="d-flex flex-column">
                    <span class="cat-subitem-rotulo">{{ item.rotulo }}</span>
                    <strong class="cat-subitem-valor">R$ {{ formatCents(item.valorCents) }}</strong>
                  </span>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="d-flex flex-column ga-1">
                    <div
                      v-for="d in item.detalhes"
                      :key="d.rotulo"
                      class="d-flex justify-space-between text-body-2"
                    >
                      <span class="text-medium-emphasis">{{ d.rotulo }}</span>
                      <strong>R$ {{ formatCents(d.valorCents) }}</strong>
                    </div>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

    <v-dialog v-model="modalAberto" max-width="480">
      <div v-if="itemAtual" class="lc-modal" :style="modalVars">
        <div class="lc-faixa">
          <div class="lc-head">
            <span class="lc-ic">
              <v-icon size="19">
                {{
                  tipoModal === 'entrada'
                    ? 'mdi-arrow-down-bold-circle-outline'
                    : tipoModal === 'sangria'
                      ? 'mdi-cash-remove'
                      : 'mdi-swap-horizontal'
                }}
              </v-icon>
            </span>
            <span class="lc-titulo">
              {{
                tipoModal === 'entrada'
                  ? 'Transferências/Entrada'
                  : tipoModal === 'sangria'
                    ? 'Transferências/Saída/Sangria'
                    : 'Transferências/Entrada/Saída/Entre caixas'
              }}
            </span>
            <v-icon class="lc-x" size="19" @click="modalAberto = false">mdi-close</v-icon>
          </div>
        </div>

        <div class="lc-corpo">
          <div class="lc-hero">
            <span class="lc-cifra">R$</span>
            <span class="lc-valor">
              <input
                :value="formatCents(itemAtual.valorCents)"
                inputmode="decimal"
                aria-label="Valor"
                @input="
                  itemAtual.valorCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </span>
          </div>

          <template v-if="tipoModal === 'transferencia' && transferenciaAtual">
            <div class="lc-dois">
              <label class="lc-campo">
                <span class="lc-campo-lbl">Caixa origem</span>
                <select v-model="transferenciaAtual.caixaOrigem" class="lc-input">
                  <option value="">Selecione...</option>
                  <option v-for="c in CAIXAS" :key="c" :value="c">{{ c }}</option>
                </select>
              </label>
              <label class="lc-campo">
                <span class="lc-campo-lbl">Caixa destino *</span>
                <select
                  v-model="transferenciaAtual.caixaDestino"
                  class="lc-input"
                  required
                  :class="{ 'lc-input-erro': transferenciaSemDestino }"
                >
                  <option value="">Selecione...</option>
                  <option v-for="c in caixasDestinoDisponiveis" :key="c" :value="c">{{ c }}</option>
                </select>
              </label>
            </div>
            <p v-if="transferenciaSemOrigem" class="lc-erro-campo">
              Selecione o caixa origem para poder salvar.
            </p>
            <p v-if="transferenciaSemDestino" class="lc-erro-campo">
              Selecione o caixa destino pra poder salvar.
            </p>

            <div class="lc-dois">
              <label class="lc-campo">
                <span class="lc-campo-lbl">N° Lacre / Doc</span>
                <input v-model="transferenciaAtual.lacre" class="lc-input" placeholder="000000" />
              </label>
              <label class="lc-campo">
                <span class="lc-campo-lbl">Data</span>
                <input v-model="transferenciaAtual.data" type="date" class="lc-input" readonly />
              </label>
            </div>

            <label class="lc-campo">
              <span class="lc-campo-lbl">Observação</span>
              <input
                v-model="transferenciaAtual.observacao"
                class="lc-input"
                placeholder="Ex.: Reforço de troco pro Caixa 2"
              />
            </label>
          </template>

          <template v-else-if="'descricao' in itemAtual">
            <label class="lc-campo">
              <span class="lc-campo-lbl">Nº Lacre</span>
              <input
                v-model="itemAtual.lacre"
                class="lc-input"
                placeholder="000000"
                inputmode="numeric"
                @blur="tipoModal === 'entrada' ? aoSairDoLacreEntrada() : undefined"
                @keydown.enter.prevent="
                  tipoModal === 'entrada' ? aoSairDoLacreEntrada() : undefined
                "
              />
            </label>
            <p
              v-if="tipoModal === 'entrada' && lacreEncontradoMsg"
              class="lc-erro-campo"
              style="color: var(--cx-positive)"
            >
              {{ lacreEncontradoMsg }}
            </p>

            <!-- Sangria sempre sai DESTE caixa e vai pro Cofre — não é uma escolha, é informativo
                 (pedido do usuário, 21/09/2026). -->
            <div v-if="tipoModal === 'sangria'" class="lc-dois">
              <label class="lc-campo">
                <span class="lc-campo-lbl">Conta de origem fixa</span>
                <input class="lc-input" :value="draft.caixa || '—'" readonly />
              </label>
              <label class="lc-campo">
                <span class="lc-campo-lbl">Conta de destino fixa</span>
                <input class="lc-input" value="Cofre" readonly />
              </label>
            </div>

            <!-- Tipo de conta da Entrada (pedido do usuário, 21/09/2026) — opcional, classifica de
                 onde veio o dinheiro. -->
            <label v-if="tipoModal === 'entrada' && 'tipoConta' in itemAtual" class="lc-campo">
              <span class="lc-campo-lbl">Tipo de conta</span>
              <select v-model="itemAtual.tipoConta" class="lc-input">
                <option value="">Selecione...</option>
                <option v-for="opcao in TIPOS_CONTA_ENTRADA" :key="opcao" :value="opcao">
                  {{ opcao }}
                </option>
              </select>
            </label>

            <label class="lc-campo">
              <span class="lc-campo-lbl">Descrição</span>
              <input
                v-model="itemAtual.descricao"
                class="lc-input"
                placeholder="Ex.: Suprimento — reforço de troco"
              />
            </label>
          </template>
        </div>

        <div class="lc-acoes">
          <button type="button" class="lc-salvar-nova" @click="remover">Remover</button>
          <button
            type="button"
            class="lc-salvar"
            :disabled="transferenciaInvalida"
            @click="modalAberto = false"
          >
            Salvar
          </button>
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<style scoped>
.lc-grupo-titulo {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Bloco Automático como zona própria (pedido do usuário, 21/09/2026): antes ficava solto na
   mesma lista dos painéis manuais, sem separação visual clara entre "editável" e "só leitura".
   Fundo levemente destacado + borda tracejada marcam essa área como um grupo à parte, sem
   inventar cor nova (continua usando a mesma paleta --cat-* de cada painel dentro dela). */
.lc-bloco-automatico {
  display: flex;
  flex-direction: column;
  gap: var(--cx-sp-3);
  margin-top: var(--cx-sp-2);
  padding: var(--cx-sp-4);
  border: 1px dashed var(--cx-line);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-sunken);
}
.lc-resumo-item {
  display: flex;
  align-items: center;
  gap: var(--cx-sp-3);
  width: 100%;
  padding: var(--cx-sp-3) var(--cx-sp-4);
  border: 1px solid var(--cat);
  border-radius: var(--cx-r-lg);
  background: var(--cat-soft);
  cursor: pointer;
  text-align: left;
  transition: box-shadow var(--cx-dur-1) var(--cx-ease);
}
.lc-resumo-item:hover {
  box-shadow: var(--cx-e-1);
}
.lc-resumo-ic {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--cx-r-sm);
  background: var(--cat);
  color: #fff;
}
.lc-resumo-corpo {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.lc-resumo-titulo {
  overflow: hidden;
  color: var(--cat-tinta);
  font-size: var(--cx-fs-micro);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lc-resumo-valor {
  color: var(--cx-ink);
  font-size: var(--cx-fs-body);
  font-weight: 600;
}
</style>
