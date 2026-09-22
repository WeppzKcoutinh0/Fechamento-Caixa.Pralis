<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  CrediarioItemDraft,
  FechamentoDraft,
  PdvEntradaDraft,
  TipoCrediario,
} from '~/types/fechamento';
import CampoFoto from '~/components/comum/CampoFoto.vue';
import CartaoValor from '~/components/comum/CartaoValor.vue';
import { useVendasFechamento } from '~/composables/useVendasFechamento';
import { calculatePdvEntradas, formatCents, toCents } from '~/utils/financeiro';
import {
  aplicarAjustesComoLancamentos,
  aplicarResumoAoPrimeiroPdv,
  caixaParaNumero,
  formatarDataBr,
  turnoParaLetra,
} from '~/utils/vendasFechamento';

const props = defineProps<{ draft: FechamentoDraft }>();

function registrarFotoMaquininha(campo: 'img-manha' | 'img-tarde', arquivo: File): void {
  props.draft.arquivosPendentes ??= {};
  props.draft.arquivosPendentes[campo] = arquivo;
}

function removerFotoMaquininha(campo: 'img-manha' | 'img-tarde'): void {
  if (props.draft.arquivosPendentes) Reflect.deleteProperty(props.draft.arquivosPendentes, campo);
}

// Painéis empilhados (PDV / Maquininhas / Crediário), mesmo padrão visual de faixa colorida +
// corpo usado em SecaoTransferencias.vue (Entradas/Sangrias/Transferência entre caixas), em vez
// da troca por abas de antes. PDV usa a cor "venda" (o Pralís mapeia relatório de vendas pra essa
// categoria — CATEGORIA_POR_TELA.relatorio_vendas = "entradas"); Maquininhas e Crediário não são
// uma das 6 categorias reais do Pralís, então ficam no roxo neutro da marca em vez de inventar
// cores sem correspondência real.
const PDV_VARS = {
  '--cat': 'var(--cat-venda-base)',
  '--cat-soft': 'var(--cat-venda-soft)',
  '--cat-faixa': 'var(--cat-venda-faixa)',
  '--cat-tinta': 'var(--cat-venda-tinta)',
};
const NEUTRO_VARS = {
  '--cat': 'var(--cx-brand)',
  '--cat-soft': 'var(--cx-brand-wash)',
  '--cat-faixa': 'var(--cx-brand)',
  '--cat-tinta': 'var(--cx-brand-text)',
};

// Preenche a aba PDV a partir das vendas já sincronizadas (bot local -> vendas_fechamento_caixa_dia,
// ver integracoes-scripts/README.md) — mesma origem e composable do botão "Buscar vendas" da
// Identificação, com o mesmo filtro por caixa/turno (um fechamento é de UM caixa, não da loja
// toda — sem caixa selecionado ainda, cai pra todos juntos). Os campos continuam editáveis
// manualmente depois de preenchidos: isto é um atalho que poupa digitação, não um valor travado.
const {
  carregando: buscandoVendas,
  erro: erroVendas,
  resumo: resumoVendas,
  buscarPorData,
} = useVendasFechamento();
const jaBuscouVendas = ref(false);
const vendasEncontradas = ref(false);
const rotuloFiltroVendas = computed(() => {
  const partes = [props.draft.caixa, props.draft.turno].filter(Boolean);
  return partes.length ? partes.join(' - ') : 'todos os caixas';
});

async function buscarVendasDoDia(): Promise<void> {
  jaBuscouVendas.value = true;
  const resumo = await buscarPorData(props.draft.data, {
    caixa: caixaParaNumero(props.draft.caixa),
    turno: turnoParaLetra(props.draft.turno),
  });
  vendasEncontradas.value = Boolean(resumo && resumo.registros > 0);
  if (!resumo || resumo.registros === 0) return;
  aplicarResumoAoPrimeiroPdv(props.draft, resumo);
  aplicarAjustesComoLancamentos(props.draft, resumo);
}

// Colaboradores/Alimentação/Furto-Roubo/Sócios/Sobra-Perda — mesmo comportamento de
// SecaoIdentificacao.vue: `buscarVendasDoDia` já lança automaticamente (aplicarAjustesComoLancamentos),
// isto aqui só lista o que foi lançado.
const ajustesPresentesRelatorios = computed(() => {
  if (!resumoVendas.value) return [];
  const { colaboradores, alimentacao, rouboFurto, socios, sobraPerda } = resumoVendas.value.ajustes;
  return [
    ['Colaboradores', colaboradores],
    ['Alimentação', alimentacao],
    ['Furto/Roubo', rouboFurto],
    ['Sócios', socios],
    ['Sobra/Perda', sobraPerda],
  ].filter(([, valor]) => Math.abs(Number(valor)) >= 0.005) as [string, number][];
});

function aoDigitarCentavos(valorBruto: string | number | null): number {
  const digitos = String(valorBruto ?? '').replace(/\D/g, '');
  return digitos ? parseInt(digitos, 10) : 0;
}
function aoDigitarNumeros(valorBruto: string | number | null): string {
  return String(valorBruto ?? '').replace(/\D/g, '');
}

// Lista de PDVs (pedido do usuário, 15/09/2026): um fechamento pode ter mais de um caixa/máquina
// reportando vendas no mesmo dia — mesmo padrão de lista+modal de Despesas/Mercadorias/Retiradas
// (SecaoLancamentos.vue). "Buscar vendas do dia" preenche/cria só o PRIMEIRO PDV da lista (ver
// aplicarResumoAoPrimeiroPdv); PDVs extras são sempre manuais.
function novaPdvEntrada(): PdvEntradaDraft {
  return {
    id: crypto.randomUUID(),
    nrClientes: 0,
    dinheiroCents: 0,
    creditoCents: 0,
    debitoCents: 0,
    pixCents: 0,
    voucherCents: 0,
    crediarioCents: 0,
  };
}

const modalPdvAberto = ref(false);
const indicePdvEditando = ref<number | null>(null);

function abrirNovoPdv(): void {
  props.draft.pdvEntradas.push(novaPdvEntrada());
  indicePdvEditando.value = props.draft.pdvEntradas.length - 1;
  modalPdvAberto.value = true;
}
function abrirPdv(entrada: PdvEntradaDraft): void {
  const indice = props.draft.pdvEntradas.indexOf(entrada);
  if (indice === -1) return;
  indicePdvEditando.value = indice;
  modalPdvAberto.value = true;
}
function removerPdvAtual(): void {
  if (indicePdvEditando.value === null) return;
  props.draft.pdvEntradas.splice(indicePdvEditando.value, 1);
  modalPdvAberto.value = false;
}
const pdvAtual = computed<PdvEntradaDraft | null>(() =>
  indicePdvEditando.value === null
    ? null
    : (props.draft.pdvEntradas[indicePdvEditando.value] ?? null),
);

function totalPdvEntrada(entrada: PdvEntradaDraft): number {
  return (
    entrada.dinheiroCents +
    entrada.creditoCents +
    entrada.debitoCents +
    entrada.pixCents +
    entrada.voucherCents +
    entrada.crediarioCents
  );
}

// calcPDV atual, somado pela lista inteira (mesma fórmula de useRelatorioCalculado.ts).
const pdvTotais = computed(() =>
  calculatePdvEntradas(
    props.draft.pdvEntradas.map((e) => ({
      nrClientes: e.nrClientes,
      dinheiroCents: e.dinheiroCents,
      creditoCents: e.creditoCents,
      debitoCents: e.debitoCents,
      pixCents: e.pixCents,
      voucherCents: e.voucherCents,
      crediarioCents: e.crediarioCents,
    })),
  ),
);

// calcCartoes atual: líquido = tarde - manhã
const liqCreditoCents = computed(
  () => props.draft.creditoTardeCents - props.draft.creditoManhaCents,
);
const liqDebitoCents = computed(() => props.draft.debitoTardeCents - props.draft.debitoManhaCents);
const liqPixCents = computed(() => props.draft.pixTardeCents - props.draft.pixManhaCents);
const liqVoucherCents = computed(
  () => props.draft.voucherTardeCents - props.draft.voucherManhaCents,
);

// toggleCrediario + adicionarCredItem/removerCredItem atuais
const tipoCrediarioAtivo = ref<TipoCrediario>('cliente');
const modalCrediarioAberto = ref(false);
const indiceCrediarioEditando = ref<number | null>(null);

function novoItemCrediario(tipo: TipoCrediario): CrediarioItemDraft {
  return { tipo, nome: '', valorCents: 0, fotoPath: null };
}
function abrirNovoCrediario(tipo: TipoCrediario): void {
  props.draft.crediario.push(novoItemCrediario(tipo));
  indiceCrediarioEditando.value = props.draft.crediario.length - 1;
  tipoCrediarioAtivo.value = tipo;
  modalCrediarioAberto.value = true;
}
function abrirCrediario(indiceGlobal: number): void {
  indiceCrediarioEditando.value = indiceGlobal;
  modalCrediarioAberto.value = true;
}
function removerCrediarioAtual(): void {
  if (indiceCrediarioEditando.value === null) return;
  props.draft.crediario.splice(indiceCrediarioEditando.value, 1);
  modalCrediarioAberto.value = false;
}
const itemCrediarioAtual = computed(() =>
  indiceCrediarioEditando.value === null
    ? null
    : props.draft.crediario[indiceCrediarioEditando.value],
);
function itensPorTipo(tipo: TipoCrediario) {
  return props.draft.crediario
    .map((item, indice) => ({ item, indice }))
    .filter(({ item }) => item.tipo === tipo);
}
const totalCredClientesCents = computed(() =>
  props.draft.crediario
    .filter((c) => c.tipo === 'cliente')
    .reduce((soma, c) => soma + c.valorCents, 0),
);
const totalCredColabCents = computed(() =>
  props.draft.crediario
    .filter((c) => c.tipo === 'colaborador')
    .reduce((soma, c) => soma + c.valorCents, 0),
);
const totalCrediarioCents = computed(
  () => totalCredClientesCents.value + totalCredColabCents.value,
);

// Painéis em acordeão: começam fechados pra não empurrar tudo pra baixo com 3 formulários
// grandes na tela ao mesmo tempo — clicar na faixa colorida abre/fecha só aquele painel.
const pdvAberto = ref(false);
const maquininhasAberto = ref(false);
const crediarioAberto = ref(false);
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <!-- Painel PDV -->
    <div class="lc-painel" :style="PDV_VARS">
      <button
        type="button"
        class="lc-faixa lc-faixa-btn"
        :aria-expanded="pdvAberto"
        @click="pdvAberto = !pdvAberto"
      >
        <div class="lc-head">
          <span class="lc-ic"><v-icon size="19">mdi-point-of-sale</v-icon></span>
          <span class="lc-titulo">Relatório PDV</span>
          <v-icon class="lc-x" size="22">{{
            pdvAberto ? 'mdi-chevron-up' : 'mdi-chevron-down'
          }}</v-icon>
        </div>
      </button>
      <v-expand-transition>
        <div v-if="pdvAberto" class="lc-painel-corpo">
          <div class="d-flex flex-column ga-2 mb-4">
            <v-btn
              color="primary"
              variant="tonal"
              size="small"
              :loading="buscandoVendas"
              :disabled="buscandoVendas"
              @click="buscarVendasDoDia"
            >
              {{ buscandoVendas ? 'Buscando vendas...' : 'Buscar vendas do dia' }}
            </v-btn>

            <v-alert
              v-if="jaBuscouVendas && !buscandoVendas && erroVendas"
              type="error"
              variant="tonal"
              density="comfortable"
            >
              {{ erroVendas }}
            </v-alert>
            <v-alert
              v-else-if="jaBuscouVendas && !buscandoVendas && !vendasEncontradas"
              type="info"
              variant="tonal"
              density="comfortable"
            >
              Nenhuma venda sincronizada para {{ rotuloFiltroVendas }} em
              {{ formatarDataBr(draft.data) }}. Preencha manualmente ou verifique se o bot está
              rodando.
            </v-alert>
            <v-alert
              v-else-if="jaBuscouVendas && !buscandoVendas && vendasEncontradas"
              type="success"
              variant="tonal"
              density="comfortable"
            >
              Campos preenchidos com as vendas de {{ rotuloFiltroVendas }} em
              {{ formatarDataBr(draft.data) }}. Confira e ajuste se precisar.
            </v-alert>

            <v-alert
              v-if="ajustesPresentesRelatorios.length"
              type="success"
              variant="tonal"
              density="comfortable"
            >
              <div class="text-caption font-weight-bold">
                O CREARE também registrou estes ajustes — já lançados automaticamente como Despesa
                (passo 3), já entram no cálculo do fechamento:
              </div>
              <ul class="text-caption mt-1 pl-4">
                <li v-for="[nome, valor] in ajustesPresentesRelatorios" :key="nome">
                  {{ nome }}: R$ {{ formatCents(toCents(valor)) }}
                </li>
              </ul>
            </v-alert>
          </div>

          <label class="lc-campo">
            <span class="lc-campo-lbl">Relatório PDV</span>
            <textarea v-model="draft.relatorioPdv" class="lc-input" rows="2" />
          </label>

          <button type="button" class="lc-add mt-3 mb-3" @click="abrirNovoPdv">
            <v-icon size="14">mdi-plus</v-icon> Adicionar PDV
          </button>

          <button
            v-for="(entrada, indice) in draft.pdvEntradas"
            :key="entrada.id"
            type="button"
            class="lc-resumo-item mb-2"
            @click="abrirPdv(entrada)"
          >
            <span class="lc-resumo-ic"><v-icon icon="mdi-point-of-sale" size="18" /></span>
            <span class="lc-resumo-corpo">
              <span class="lc-resumo-titulo">PDV {{ indice + 1 }}</span>
              <span class="lc-resumo-valor">R$ {{ formatCents(totalPdvEntrada(entrada)) }}</span>
            </span>
          </button>

          <p v-if="!draft.pdvEntradas.length" class="text-caption text-medium-emphasis mb-0">
            Nenhum PDV lançado ainda.
          </p>

          <div class="grade-cartoes lc-mt">
            <CartaoValor
              rotulo="Valor Total PDV"
              :valor="`R$ ${formatCents(pdvTotais.totalCents)}`"
            />
            <CartaoValor
              rotulo="Ticket Médio"
              :valor="`R$ ${formatCents(pdvTotais.averageTicketCents)}`"
            />
          </div>

          <div class="lc-campo lc-mt">
            <CampoFoto
              v-model="draft.imgPdvPath"
              :fechamento-id="draft.id"
              campo="img-pdv"
              label="Imagem Relatório PDV"
            />
          </div>
        </div>
      </v-expand-transition>
    </div>

    <v-dialog v-model="modalPdvAberto" max-width="440">
      <div v-if="pdvAtual" class="lc-modal" :style="PDV_VARS">
        <div class="lc-faixa">
          <div class="lc-head">
            <span class="lc-ic"><v-icon size="19">mdi-point-of-sale</v-icon></span>
            <span class="lc-titulo">PDV</span>
            <v-icon class="lc-x" size="19" @click="modalPdvAberto = false">mdi-close</v-icon>
          </div>
        </div>
        <div class="lc-corpo">
          <label class="lc-campo">
            <span class="lc-campo-lbl">Nº Clientes</span>
            <input
              :value="pdvAtual.nrClientes || ''"
              class="lc-input"
              inputmode="numeric"
              placeholder="0"
              @input="
                pdvAtual.nrClientes = parseInt(
                  aoDigitarNumeros(($event.target as HTMLInputElement).value) || '0',
                  10,
                )
              "
            />
          </label>

          <div class="lc-dois">
            <label class="lc-campo">
              <span class="lc-campo-lbl">Dinheiro</span>
              <input
                :value="formatCents(pdvAtual.dinheiroCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  pdvAtual.dinheiroCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Crédito</span>
              <input
                :value="formatCents(pdvAtual.creditoCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  pdvAtual.creditoCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
          </div>
          <div class="lc-dois">
            <label class="lc-campo">
              <span class="lc-campo-lbl">Débito</span>
              <input
                :value="formatCents(pdvAtual.debitoCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  pdvAtual.debitoCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Pix</span>
              <input
                :value="formatCents(pdvAtual.pixCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  pdvAtual.pixCents = aoDigitarCentavos(($event.target as HTMLInputElement).value)
                "
              />
            </label>
          </div>
          <div class="lc-dois">
            <label class="lc-campo">
              <span class="lc-campo-lbl">Voucher</span>
              <input
                :value="formatCents(pdvAtual.voucherCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  pdvAtual.voucherCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Crediário</span>
              <input
                :value="formatCents(pdvAtual.crediarioCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  pdvAtual.crediarioCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
          </div>

          <div class="lc-campo lc-mt">
            <CartaoValor
              rotulo="Valor Total"
              :valor="`R$ ${formatCents(totalPdvEntrada(pdvAtual))}`"
            />
          </div>
        </div>
        <div class="lc-acoes">
          <button type="button" class="lc-salvar-nova" @click="removerPdvAtual">Remover</button>
          <button type="button" class="lc-salvar" @click="modalPdvAberto = false">Salvar</button>
        </div>
      </div>
    </v-dialog>

    <!-- Painel Maquininhas -->
    <div class="lc-painel" :style="NEUTRO_VARS">
      <button
        type="button"
        class="lc-faixa lc-faixa-btn"
        :aria-expanded="maquininhasAberto"
        @click="maquininhasAberto = !maquininhasAberto"
      >
        <div class="lc-head">
          <span class="lc-ic"><v-icon size="19">mdi-credit-card-outline</v-icon></span>
          <span class="lc-titulo">Maquininhas</span>
          <v-icon class="lc-x" size="22">
            {{ maquininhasAberto ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
          </v-icon>
        </div>
      </button>
      <v-expand-transition>
        <div v-if="maquininhasAberto" class="lc-painel-corpo">
          <label class="lc-campo">
            <span class="lc-campo-lbl">Nº Maquininha</span>
            <input
              :value="draft.nrMaquininha"
              class="lc-input"
              inputmode="numeric"
              placeholder="Número da maquininha"
              @input="
                draft.nrMaquininha = aoDigitarNumeros(($event.target as HTMLInputElement).value)
              "
            />
          </label>

          <div
            class="lc-campo-lbl lc-mt"
            style="text-transform: none; font-size: var(--cx-fs-caption)"
          >
            Turno da Manhã
          </div>
          <div class="lc-dois">
            <label class="lc-campo">
              <span class="lc-campo-lbl">Manhã Inicial</span>
              <input
                :value="formatCents(draft.manhaInicialCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  draft.manhaInicialCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Crédito Manhã</span>
              <input
                :value="formatCents(draft.creditoManhaCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  draft.creditoManhaCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
          </div>
          <div class="lc-dois">
            <label class="lc-campo">
              <span class="lc-campo-lbl">Débito Manhã</span>
              <input
                :value="formatCents(draft.debitoManhaCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  draft.debitoManhaCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Pix Manhã</span>
              <input
                :value="formatCents(draft.pixManhaCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  draft.pixManhaCents = aoDigitarCentavos(($event.target as HTMLInputElement).value)
                "
              />
            </label>
          </div>
          <label class="lc-campo">
            <span class="lc-campo-lbl">Voucher Manhã</span>
            <input
              :value="formatCents(draft.voucherManhaCents)"
              class="lc-input"
              inputmode="decimal"
              @input="
                draft.voucherManhaCents = aoDigitarCentavos(
                  ($event.target as HTMLInputElement).value,
                )
              "
            />
          </label>
          <div class="lc-campo">
            <CampoFoto
              v-model="draft.imgManhaPath"
              :fechamento-id="draft.id"
              campo="img-manha"
              label="Imagem Manhã"
              upload-adiado
              @arquivo-selecionado="registrarFotoMaquininha('img-manha', $event)"
              @arquivo-removido="removerFotoMaquininha('img-manha')"
            />
          </div>

          <div
            class="lc-campo-lbl lc-mt"
            style="text-transform: none; font-size: var(--cx-fs-caption)"
          >
            Turno da Tarde
          </div>
          <div class="lc-dois">
            <label class="lc-campo">
              <span class="lc-campo-lbl">Tarde Final</span>
              <input
                :value="formatCents(draft.tardeFinalCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  draft.tardeFinalCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Crédito Tarde</span>
              <input
                :value="formatCents(draft.creditoTardeCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  draft.creditoTardeCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
          </div>
          <div class="lc-dois">
            <label class="lc-campo">
              <span class="lc-campo-lbl">Débito Tarde</span>
              <input
                :value="formatCents(draft.debitoTardeCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  draft.debitoTardeCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Pix Tarde</span>
              <input
                :value="formatCents(draft.pixTardeCents)"
                class="lc-input"
                inputmode="decimal"
                @input="
                  draft.pixTardeCents = aoDigitarCentavos(($event.target as HTMLInputElement).value)
                "
              />
            </label>
          </div>
          <label class="lc-campo">
            <span class="lc-campo-lbl">Voucher Tarde</span>
            <input
              :value="formatCents(draft.voucherTardeCents)"
              class="lc-input"
              inputmode="decimal"
              @input="
                draft.voucherTardeCents = aoDigitarCentavos(
                  ($event.target as HTMLInputElement).value,
                )
              "
            />
          </label>
          <div class="lc-campo">
            <CampoFoto
              v-model="draft.imgTardePath"
              :fechamento-id="draft.id"
              campo="img-tarde"
              label="Imagem Tarde"
              upload-adiado
              @arquivo-selecionado="registrarFotoMaquininha('img-tarde', $event)"
              @arquivo-removido="removerFotoMaquininha('img-tarde')"
            />
          </div>

          <div
            class="lc-campo-lbl lc-mt"
            style="text-transform: none; font-size: var(--cx-fs-caption)"
          >
            Líquido
          </div>
          <div class="grade-cartoes">
            <CartaoValor rotulo="Líquido Crédito" :valor="`R$ ${formatCents(liqCreditoCents)}`" />
            <CartaoValor rotulo="Líquido Débito" :valor="`R$ ${formatCents(liqDebitoCents)}`" />
            <CartaoValor rotulo="Líquido Pix" :valor="`R$ ${formatCents(liqPixCents)}`" />
            <CartaoValor rotulo="Líquido Voucher" :valor="`R$ ${formatCents(liqVoucherCents)}`" />
          </div>
        </div>
      </v-expand-transition>
    </div>

    <!-- Painel Crediário -->
    <div class="lc-painel" :style="NEUTRO_VARS">
      <div class="lc-faixa">
        <button
          type="button"
          class="lc-head lc-head-btn"
          :aria-expanded="crediarioAberto"
          @click="crediarioAberto = !crediarioAberto"
        >
          <span class="lc-ic"><v-icon size="19">mdi-account-cash-outline</v-icon></span>
          <span class="lc-titulo">Crediário</span>
          <v-icon class="lc-x" size="22">
            {{ crediarioAberto ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
          </v-icon>
        </button>
        <div v-if="crediarioAberto" class="lc-cats" role="group" aria-label="Tipo do crediário">
          <button
            type="button"
            class="lc-cat"
            :class="{ ativa: tipoCrediarioAtivo === 'cliente' }"
            style="--cat-btn-faixa: var(--cx-brand)"
            @click="tipoCrediarioAtivo = 'cliente'"
          >
            <v-icon size="16">mdi-account</v-icon>
            <span>Clientes</span>
          </button>
          <button
            type="button"
            class="lc-cat"
            :class="{ ativa: tipoCrediarioAtivo === 'colaborador' }"
            style="--cat-btn-faixa: var(--cx-brand)"
            @click="tipoCrediarioAtivo = 'colaborador'"
          >
            <v-icon size="16">mdi-badge-account</v-icon>
            <span>Colaboradores</span>
          </button>
        </div>
      </div>
      <v-expand-transition>
        <div v-if="crediarioAberto" class="lc-painel-corpo">
          <button type="button" class="lc-add mb-3" @click="abrirNovoCrediario(tipoCrediarioAtivo)">
            <v-icon size="14">mdi-plus</v-icon>
            Adicionar {{ tipoCrediarioAtivo === 'cliente' ? 'cliente' : 'colaborador' }}
          </button>

          <button
            v-for="{ item, indice } in itensPorTipo(tipoCrediarioAtivo)"
            :key="indice"
            type="button"
            class="lc-resumo-item mb-2"
            @click="abrirCrediario(indice)"
          >
            <span class="lc-resumo-ic"><v-icon icon="mdi-account-cash-outline" size="18" /></span>
            <span class="lc-resumo-corpo">
              <span class="lc-resumo-titulo">{{ item.nome || 'Sem nome' }}</span>
              <span class="lc-resumo-valor">R$ {{ formatCents(item.valorCents) }}</span>
            </span>
          </button>

          <div class="grade-cartoes lc-mt">
            <CartaoValor
              rotulo="Total Clientes"
              :valor="`R$ ${formatCents(totalCredClientesCents)}`"
            />
            <CartaoValor
              rotulo="Total Colaboradores"
              :valor="`R$ ${formatCents(totalCredColabCents)}`"
            />
            <CartaoValor
              rotulo="Total Crediário"
              :valor="`R$ ${formatCents(totalCrediarioCents)}`"
            />
          </div>
        </div>
      </v-expand-transition>
    </div>

    <v-dialog v-model="modalCrediarioAberto" max-width="440">
      <div v-if="itemCrediarioAtual" class="lc-modal" :style="NEUTRO_VARS">
        <div class="lc-faixa">
          <div class="lc-head">
            <span class="lc-ic"><v-icon size="19">mdi-account-cash-outline</v-icon></span>
            <span class="lc-titulo">
              {{ itemCrediarioAtual.tipo === 'cliente' ? 'Cliente' : 'Colaborador' }}
            </span>
            <v-icon class="lc-x" size="19" @click="modalCrediarioAberto = false">mdi-close</v-icon>
          </div>
        </div>
        <div class="lc-corpo">
          <div class="lc-hero">
            <span class="lc-cifra">R$</span>
            <span class="lc-valor">
              <input
                :value="formatCents(itemCrediarioAtual.valorCents)"
                inputmode="decimal"
                aria-label="Valor"
                @input="
                  itemCrediarioAtual.valorCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </span>
          </div>
          <label class="lc-campo">
            <span class="lc-campo-lbl">Nome do Cliente</span>
            <input v-model="itemCrediarioAtual.nome" class="lc-input" placeholder="Nome completo" />
          </label>
          <div class="lc-campo">
            <CampoFoto
              v-model="itemCrediarioAtual.fotoPath"
              :fechamento-id="draft.id"
              campo="cred-cupom"
              label="Foto do cupom assinado"
            />
          </div>
        </div>
        <div class="lc-acoes">
          <button type="button" class="lc-salvar-nova" @click="removerCrediarioAtual">
            Remover
          </button>
          <button type="button" class="lc-salvar" @click="modalCrediarioAberto = false">
            Salvar
          </button>
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<style scoped>
/* .lc-painel / .lc-painel-corpo agora vivem em assets/main.css (eram só daqui, "scoped", e por
   isso nunca aplicavam nas outras telas que também usam essas classes). */
.lc-faixa-btn {
  display: block;
  width: 100%;
  border: 0;
  margin: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.lc-head-btn {
  width: 100%;
  border: 0;
  padding: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
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
