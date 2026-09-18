<script setup lang="ts">
import { computed, ref } from 'vue';
import { CAIXAS, type EntradaDraft, type FechamentoDraft, type SangriaDraft, type TransferenciaCaixaDraft } from '~/types/fechamento';
import CartaoValor from '~/components/comum/CartaoValor.vue';
import { formatCents } from '~/utils/financeiro';
import { useTransferenciasTesouraria } from '~/composables/useTransferenciasTesouraria';

const props = defineProps<{ draft: FechamentoDraft }>();

// Mesmo padrão visual do Sistema Inteligente Pralís pros painéis "Entradas"/"Transferências" do
// menu: Entradas usa a cor "entradas" (amarelo) e Sangria usa "transferências" (laranja) — no
// próprio Pralís a saída de transferência é exibida como "TRANSF. SAÍDA" dentro do laranja, então
// a divisão de cor bate exatamente com o que já existia aqui (entrada = dinheiro entrando,
// sangria = saída pro cofre). Campos preservados 1:1 (Lacre, Valor, Descrição).
//
// "Transferência entre caixas" (painel novo, cor "retiradas"/azul): versão simplificada, por
// decisão do usuário, da Transferência do Pralís — lá é um sistema de contas com múltiplos
// destinos candidatos e confirmação por outra pessoa (modal `OperacaoTransferenciaModal.vue`
// daquele projeto); aqui é só um registro de que dinheiro mudou de um caixa físico para outro,
// preenchido e salvo junto com o resto do fechamento, sem cadastro de contas nem conferência.
type TipoModal = 'entrada' | 'sangria' | 'transferencia';

const ENTRADA_VARS = {
  '--cat': 'var(--cat-venda-base)',
  '--cat-soft': 'var(--cat-venda-soft)',
  '--cat-faixa': 'var(--cat-venda-faixa)',
  '--cat-tinta': 'var(--cat-venda-tinta)',
};
const SANGRIA_VARS = {
  '--cat': 'var(--cat-transferencias-base)',
  '--cat-soft': 'var(--cat-transferencias-soft)',
  '--cat-faixa': 'var(--cat-transferencias-faixa)',
  '--cat-tinta': 'var(--cat-transferencias-tinta)',
};
const TRANSFERENCIA_VARS = {
  '--cat': 'var(--cat-retiradas-base)',
  '--cat-soft': 'var(--cat-retiradas-soft)',
  '--cat-faixa': 'var(--cat-retiradas-faixa)',
  '--cat-tinta': 'var(--cat-retiradas-tinta)',
};

function novaEntrada(): EntradaDraft {
  return { lacre: '', valorCents: 0, descricao: '' };
}
function novaSangria(): SangriaDraft {
  return { descricao: '', lacre: '', valorCents: 0 };
}
// Data travada na data do fechamento (pedido do usuário, 18/09/2026) — ver mesma decisão em
// SecaoLancamentos.vue.
function novaTransferencia(): TransferenciaCaixaDraft {
  return { caixaOrigem: '', caixaDestino: '', valorCents: 0, lacre: '', data: props.draft.data, observacao: '' };
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
  tipoModal.value === 'entrada' ? ENTRADA_VARS : tipoModal.value === 'sangria' ? SANGRIA_VARS : TRANSFERENCIA_VARS,
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
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <!-- Painel Entradas -->
    <div class="lc-painel" :style="ENTRADA_VARS">
      <div class="lc-faixa">
        <div class="lc-head">
          <span class="lc-ic"><v-icon size="19">mdi-arrow-down-bold-circle-outline</v-icon></span>
          <span class="lc-titulo">Entradas</span>
        </div>
      </div>
      <div class="lc-painel-corpo">
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
      </div>
    </div>

    <!-- Painel Sangrias -->
    <div class="lc-painel" :style="SANGRIA_VARS">
      <div class="lc-faixa">
        <div class="lc-head">
          <span class="lc-ic"><v-icon size="19">mdi-cash-remove</v-icon></span>
          <span class="lc-titulo">Sangrias</span>
        </div>
      </div>
      <div class="lc-painel-corpo">
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
      </div>
    </div>

    <!-- Painel Transferência entre caixas -->
    <div class="lc-painel" :style="TRANSFERENCIA_VARS">
      <div class="lc-faixa">
        <div class="lc-head">
          <span class="lc-ic"><v-icon size="19">mdi-swap-horizontal</v-icon></span>
          <span class="lc-titulo">Transferência entre caixas</span>
        </div>
      </div>
      <div class="lc-painel-corpo">
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
      </div>
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
                  ? 'Nova entrada'
                  : tipoModal === 'sangria'
                    ? 'Nova sangria'
                    : 'Nova transferência'
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
              />
            </label>
            <p v-if="tipoModal === 'entrada' && lacreEncontradoMsg" class="lc-erro-campo" style="color: var(--cx-positive)">
              {{ lacreEncontradoMsg }}
            </p>
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
            :disabled="transferenciaSemDestino"
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
