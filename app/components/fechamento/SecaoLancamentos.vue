<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
  DiscriminacaoDraft,
  FechamentoDraft,
  LancamentoDraft,
  TipoCredor,
  TipoLancamento,
} from '~/types/fechamento';
import { GRUPOS_DISCRIMINACAO, TIPOS_CREDOR, TIPOS_LANCAMENTO, TIPOS_MER } from '~/types/fechamento';
import CampoFoto from '~/components/comum/CampoFoto.vue';
import CartaoValor from '~/components/comum/CartaoValor.vue';
import GravadorAudio from '~/components/comum/GravadorAudio.vue';
import {
  calculateDiscrimination,
  calculateValorTotalLancamento,
  formatCents,
} from '~/utils/financeiro';

const props = defineProps<{ draft: FechamentoDraft }>();

// Mesmo padrão visual do modal de Despesa/Mercadoria/Retirada do Sistema Inteligente Pralís
// (faixa colorida por categoria, ícone, abas de tipo) — campos existentes preservados 1:1, mais
// Juros/Tipo de credor/Data pagamento (extensão aditiva, ver types/fechamento.ts).
//
// Lista, não card único: até esta revisão só existia 1 lançamento visível por tipo na UI (decisão
// documentada em docs/CONTRATO-COMPORTAMENTO-ATUAL.md). O usuário pediu pra permitir várias
// despesas/mercadorias/retiradas por fechamento — mesmo padrão de lista que Entradas/Sangrias
// (SecaoTransferencias.vue) já usava. Ver types/fechamento.ts (LancamentoDraft.id /
// DiscriminacaoDraft.lancamentoId) para como a discriminação passou a ficar presa ao lançamento
// certo, e não só ao tipo.
const ROTULOS_TIPO: Record<TipoLancamento, string> = {
  despesa: 'Despesa',
  mercadoria: 'Mercadoria',
  retirada: 'Retirada',
};
const ICONES_TIPO: Record<TipoLancamento, string> = {
  despesa: 'mdi-file-document-outline',
  mercadoria: 'mdi-package-variant-closed',
  retirada: 'mdi-cash-remove',
};
const CAT_TOKEN: Record<TipoLancamento, string> = {
  despesa: 'despesas',
  mercadoria: 'mercadorias',
  retirada: 'retiradas',
};
const ROTULOS_TIPO_MER: Record<string, string> = {
  computado: 'Mer Computado',
  nao_computado: 'Mer Não Computado',
};
const ROTULOS_CREDOR: Record<TipoCredor, string> = {
  fornecedor: 'Fornecedor',
  colaborador: 'Colaborador',
};
const ROTULOS_GRUPO: Record<string, string> = {
  paes: 'Pães',
  bolos: 'Bolos e Tortas',
  salgados: 'Salgados',
  doces: 'Doces e Confeitos',
  bebidas: 'Bebidas',
  laticinios: 'Laticínios',
  frios: 'Frios e Embutidos',
  materia_prima: 'Matéria-prima',
  embalagens: 'Embalagens',
  limpeza: 'Limpeza',
  utensilios: 'Utensílios',
  funcionarios: 'Funcionários',
  servicos: 'Serviços',
  outros: 'Outros',
};

// Pedido do usuário (18/09/2026): todo campo de data do lançamento fica travado na data do
// PRÓPRIO fechamento (`draft.data` — sempre "hoje" no momento em que o fechamento foi criado,
// nunca muda depois), não mais editável. Ciente do trade-off avisado e aceito pelo usuário: nota
// fiscal atrasada, vencimento futuro e pagamento em outro dia deixam de ser representáveis aqui —
// decisão deliberada dele, "é fechamento de caixa daquele dia específico".
function novoLancamento(tipo: TipoLancamento): LancamentoDraft {
  return {
    id: crypto.randomUUID(),
    tipo,
    status: 'naopago',
    dataRef: props.draft.data,
    dataNfe: props.draft.data,
    nNfe: '',
    fornecedor: '',
    tipoMer: '',
    valorCents: 0,
    valorAcrescimoCents: 0,
    tipoCredor: 'fornecedor',
    obsTipo: '',
    obsTexto: '',
    obsAudioPath: null,
    fotoPath: null,
    vencimento: props.draft.data,
    dataPagamento: props.draft.data,
    fotoNotaPath: null,
    origemAjusteCreare: '',
  };
}

function lancamentosPorTipo(tipo: TipoLancamento): LancamentoDraft[] {
  return props.draft.lancamentos.filter((l) => l.tipo === tipo);
}
function totalPorTipo(tipo: TipoLancamento): number {
  return lancamentosPorTipo(tipo).reduce((soma, l) => soma + l.valorCents + l.valorAcrescimoCents, 0);
}

const modalAberto = ref(false);
const indiceEditando = ref<number | null>(null);

function abrirNovo(tipo: TipoLancamento): void {
  props.draft.lancamentos.push(novoLancamento(tipo));
  indiceEditando.value = props.draft.lancamentos.length - 1;
  modalAberto.value = true;
}
function abrirExistente(lancamento: LancamentoDraft): void {
  const indice = props.draft.lancamentos.indexOf(lancamento);
  if (indice === -1) return;
  indiceEditando.value = indice;
  modalAberto.value = true;
}

const lancamentoAtual = computed<LancamentoDraft | null>(() =>
  indiceEditando.value === null ? null : (props.draft.lancamentos[indiceEditando.value] ?? null),
);
const tipoAtual = computed<TipoLancamento>(() => lancamentoAtual.value?.tipo ?? 'despesa');

function remover(): void {
  if (indiceEditando.value === null) return;
  const lancamento = props.draft.lancamentos[indiceEditando.value];
  props.draft.lancamentos.splice(indiceEditando.value, 1);
  modalAberto.value = false;
  if (!lancamento) return;
  // Itens discriminados deste lançamento não fazem mais sentido sem ele.
  for (let i = props.draft.discriminacoes.length - 1; i >= 0; i -= 1) {
    if (props.draft.discriminacoes[i]?.lancamentoId === lancamento.id) props.draft.discriminacoes.splice(i, 1);
  }
}

const catVars = computed(() => {
  const token = CAT_TOKEN[tipoAtual.value];
  return {
    '--cat': `var(--cat-${token}-base)`,
    '--cat-soft': `var(--cat-${token}-soft)`,
    '--cat-faixa': `var(--cat-${token}-faixa)`,
    '--cat-tinta': `var(--cat-${token}-tinta)`,
  };
});

const valorTotal = computed(() =>
  lancamentoAtual.value
    ? calculateValorTotalLancamento(
        lancamentoAtual.value.valorCents,
        lancamentoAtual.value.valorAcrescimoCents,
      )
    : 0,
);

function aoDigitarCentavos(valorBruto: string | number | null): number {
  const digitos = String(valorBruto ?? '').replace(/\D/g, '');
  return digitos ? parseInt(digitos, 10) : 0;
}
function aoDigitarNumero(valorBruto: string | number | null): number {
  const texto = String(valorBruto ?? '');
  return texto ? parseFloat(texto) : 0;
}

// Discriminar itens — detalhe DESTE lançamento (não do tipo inteiro: com várias despesas no
// mesmo fechamento, cada uma tem os próprios itens).
const discriminando = ref(false);

function novoItemDiscriminacao(lancamento: LancamentoDraft): DiscriminacaoDraft {
  return {
    lancamentoId: lancamento.id,
    tipo: lancamento.tipo,
    qtd: 0,
    produto: '',
    grupo: '',
    valUnitCents: 0,
    descontoValCents: 0,
    descontoPct: 0,
  };
}
function adicionarItemDiscriminacao(): void {
  if (!lancamentoAtual.value) return;
  props.draft.discriminacoes.push(novoItemDiscriminacao(lancamentoAtual.value));
  discriminando.value = true;
}
function removerItemDiscriminacao(item: DiscriminacaoDraft): void {
  const indice = props.draft.discriminacoes.indexOf(item);
  if (indice !== -1) props.draft.discriminacoes.splice(indice, 1);
}
const itensDiscriminacao = computed(() =>
  lancamentoAtual.value
    ? props.draft.discriminacoes.filter((d) => d.lancamentoId === lancamentoAtual.value!.id)
    : [],
);
function totalItemDiscriminacao(item: DiscriminacaoDraft): number {
  return calculateDiscrimination({
    quantity: item.qtd,
    unitValueCents: item.valUnitCents,
    fixedDiscountCents: item.descontoValCents,
    discountPercent: item.descontoPct,
  }).totalCents;
}
const totalGeralDiscriminacao = computed(() =>
  itensDiscriminacao.value.reduce((soma, item) => soma + totalItemDiscriminacao(item), 0),
);
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <div
      v-for="tipo in TIPOS_LANCAMENTO"
      :key="tipo"
      class="lc-painel"
      :style="{
        '--cat': `var(--cat-${CAT_TOKEN[tipo]}-base)`,
        '--cat-soft': `var(--cat-${CAT_TOKEN[tipo]}-soft)`,
        '--cat-faixa': `var(--cat-${CAT_TOKEN[tipo]}-faixa)`,
        '--cat-tinta': `var(--cat-${CAT_TOKEN[tipo]}-tinta)`,
      }"
    >
      <div class="lc-faixa">
        <div class="lc-head">
          <span class="lc-ic"><v-icon size="19">{{ ICONES_TIPO[tipo] }}</v-icon></span>
          <span class="lc-titulo">{{ ROTULOS_TIPO[tipo] }}s</span>
        </div>
      </div>
      <div class="lc-painel-corpo">
        <button type="button" class="lc-add mb-3" @click="abrirNovo(tipo)">
          <v-icon size="14">mdi-plus</v-icon> Adicionar {{ ROTULOS_TIPO[tipo].toLowerCase() }}
        </button>

        <button
          v-for="lancamento in lancamentosPorTipo(tipo)"
          :key="lancamento.id"
          type="button"
          class="lc-resumo-item mb-2"
          @click="abrirExistente(lancamento)"
        >
          <span class="lc-resumo-ic"><v-icon :icon="ICONES_TIPO[tipo]" size="18" /></span>
          <span class="lc-resumo-corpo">
            <span class="lc-resumo-titulo">{{ lancamento.fornecedor || 'Sem credor' }}</span>
            <span class="lc-resumo-valor">
              R$ {{ formatCents(lancamento.valorCents + lancamento.valorAcrescimoCents) }}
            </span>
          </span>
        </button>

        <p v-if="!lancamentosPorTipo(tipo).length" class="text-caption text-medium-emphasis mb-0">
          Nenhuma {{ ROTULOS_TIPO[tipo].toLowerCase() }} lançada ainda.
        </p>
        <div v-else class="grade-cartoes lc-mt">
          <CartaoValor :rotulo="`Total ${ROTULOS_TIPO[tipo]}`" :valor="`R$ ${formatCents(totalPorTipo(tipo))}`" />
        </div>
      </div>
    </div>

    <v-dialog v-model="modalAberto" max-width="560">
      <div v-if="lancamentoAtual" class="lc-modal" :style="catVars">
        <div class="lc-faixa">
          <div class="lc-head">
            <span class="lc-ic"
              ><v-icon size="19">{{ ICONES_TIPO[tipoAtual] }}</v-icon></span
            >
            <span class="lc-titulo">{{ ROTULOS_TIPO[tipoAtual] }}</span>
            <v-icon class="lc-x" size="19" @click="modalAberto = false">mdi-close</v-icon>
          </div>
          <div class="lc-cats" role="group" aria-label="Tipo do lançamento">
            <button
              v-for="tipo in TIPOS_LANCAMENTO"
              :key="tipo"
              type="button"
              class="lc-cat"
              :class="{ ativa: tipoAtual === tipo }"
              :style="{ '--cat-btn-faixa': `var(--cat-${CAT_TOKEN[tipo]}-faixa)` }"
              @click="lancamentoAtual.tipo = tipo"
            >
              <v-icon size="16">{{ ICONES_TIPO[tipo] }}</v-icon>
              <span>{{ ROTULOS_TIPO[tipo] }}</span>
            </button>
          </div>
        </div>

        <div class="lc-corpo">
          <!-- Linha 1: Valor (hero) -->
          <div class="lc-hero">
            <span class="lc-cifra">R$</span>
            <span class="lc-valor">
              <input
                :value="formatCents(lancamentoAtual.valorCents)"
                inputmode="decimal"
                aria-label="Valor"
                @input="
                  lancamentoAtual.valorCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </span>
          </div>

          <!-- Linha 2: Juros · Valor Total -->
          <div class="lc-tres">
            <label class="lc-campo">
              <span class="lc-campo-lbl">Juros</span>
              <input
                class="lc-input"
                :value="formatCents(lancamentoAtual.valorAcrescimoCents)"
                inputmode="decimal"
                @input="
                  lancamentoAtual.valorAcrescimoCents = aoDigitarCentavos(
                    ($event.target as HTMLInputElement).value,
                  )
                "
              />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Valor Total</span>
              <input
                class="lc-input lc-input-ro"
                :value="`R$ ${formatCents(valorTotal)}`"
                readonly
              />
            </label>
          </div>

          <!-- Linha 3: Data Lanç · Data Doc Fiscal · Nº Doc Fiscal — larguras assimétricas
               (.lc-tres-datas), não as 3 colunas iguais padrão do .lc-tres: "N° Doc. Fiscal" é só
               texto livre (sem largura mínima de input nativo) — é quem cede espaço pros outros
               dois caberem lado a lado. Data Lanç/Data Doc. Fiscal travadas na data do fechamento
               (pedido do usuário, 18/09/2026) — sem botão "Hoje", ficou redundante. -->
          <div class="lc-tres lc-tres-datas">
            <label class="lc-campo">
              <span class="lc-campo-lbl">Data Lanç</span>
              <input v-model="lancamentoAtual.dataRef" type="date" class="lc-input" readonly />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Data Doc. Fiscal</span>
              <input v-model="lancamentoAtual.dataNfe" type="date" class="lc-input" readonly />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">N° Doc. Fiscal</span>
              <input v-model="lancamentoAtual.nNfe" class="lc-input" placeholder="000000" />
            </label>
          </div>

          <!-- Tipo de mercadoria — só em Mercadoria, campo original preservado. -->
          <label v-if="tipoAtual === 'mercadoria'" class="lc-campo">
            <span class="lc-campo-lbl">Tipo</span>
            <select v-model="lancamentoAtual.tipoMer" class="lc-input">
              <option value="">Selecione o tipo...</option>
              <option v-for="v in TIPOS_MER" :key="v" :value="v">{{ ROTULOS_TIPO_MER[v] }}</option>
            </select>
          </label>

          <!-- Tipo de credor → Credor -->
          <div class="lc-campo-lbl lc-mt">Tipo de credor</div>
          <div class="lc-chips">
            <button
              v-for="t in TIPOS_CREDOR"
              :key="t"
              type="button"
              class="lc-chip"
              :class="{ ativo: lancamentoAtual.tipoCredor === t }"
              @click="lancamentoAtual.tipoCredor = t"
            >
              {{ ROTULOS_CREDOR[t] }}
            </button>
          </div>
          <label class="lc-campo">
            <span class="lc-campo-lbl">Credor</span>
            <input
              v-model="lancamentoAtual.fornecedor"
              class="lc-input"
              placeholder="Nome do credor"
            />
          </label>

          <!-- Discriminar itens — recolhível, mesma ideia do modal do Pralís. -->
          <button type="button" class="lc-linha" @click="discriminando = !discriminando">
            <v-icon size="17">mdi-format-list-bulleted</v-icon>
            Discriminar itens
            <span v-if="itensDiscriminacao.length" class="text-caption"
              >({{ itensDiscriminacao.length }})</span
            >
            <span class="lc-flex" />
            <v-icon size="16">{{
              discriminando ? 'mdi-chevron-down' : 'mdi-chevron-right'
            }}</v-icon>
          </button>

          <div v-if="discriminando" class="disc">
            <div v-if="itensDiscriminacao.length" class="disc-scroll">
              <table class="disc-tabela">
                <thead>
                  <tr>
                    <th>Qtd</th>
                    <th>Produto</th>
                    <th>Grupo</th>
                    <th>V.Unit</th>
                    <th>Desc. R$</th>
                    <th>Desc. %</th>
                    <th>V.Total</th>
                    <th aria-label="remover" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in itensDiscriminacao" :key="itensDiscriminacao.indexOf(item)">
                    <td>
                      <input
                        :value="item.qtd || ''"
                        type="number"
                        min="0"
                        step="0.001"
                        class="disc-in disc-qtd"
                        @input="
                          item.qtd = aoDigitarNumero(($event.target as HTMLInputElement).value)
                        "
                      />
                    </td>
                    <td><input v-model="item.produto" class="disc-in" placeholder="Produto" /></td>
                    <td>
                      <select v-model="item.grupo" class="disc-in disc-grupo">
                        <option value="">—</option>
                        <option v-for="g in GRUPOS_DISCRIMINACAO" :key="g" :value="g">
                          {{ ROTULOS_GRUPO[g] }}
                        </option>
                      </select>
                    </td>
                    <td>
                      <input
                        :value="formatCents(item.valUnitCents)"
                        class="disc-in disc-num"
                        inputmode="decimal"
                        @input="
                          item.valUnitCents = aoDigitarCentavos(
                            ($event.target as HTMLInputElement).value,
                          )
                        "
                      />
                    </td>
                    <td>
                      <input
                        :value="formatCents(item.descontoValCents)"
                        class="disc-in disc-num"
                        inputmode="decimal"
                        @input="
                          item.descontoValCents = aoDigitarCentavos(
                            ($event.target as HTMLInputElement).value,
                          )
                        "
                      />
                    </td>
                    <td>
                      <input
                        :value="item.descontoPct || ''"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        class="disc-in disc-num"
                        @input="
                          item.descontoPct = Math.min(
                            100,
                            Math.max(0, aoDigitarNumero(($event.target as HTMLInputElement).value)),
                          )
                        "
                      />
                    </td>
                    <td class="disc-calc">R$ {{ formatCents(totalItemDiscriminacao(item)) }}</td>
                    <td>
                      <v-icon
                        size="18"
                        class="disc-item-del"
                        @click="removerItemDiscriminacao(item)"
                      >
                        mdi-close
                      </v-icon>
                    </td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td colspan="6" class="disc-foot-lbl">Total geral</td>
                    <td class="disc-calc disc-foot">
                      R$ {{ formatCents(totalGeralDiscriminacao) }}
                    </td>
                    <td class="disc-foot" />
                  </tr>
                </tfoot>
              </table>
            </div>
            <button type="button" class="lc-add mt-2" @click="adicionarItemDiscriminacao">
              <v-icon size="15">mdi-plus</v-icon> Adicionar item
            </button>
          </div>

          <!-- Observação (texto ou áudio) -->
          <div class="lc-campo-lbl lc-mt">Observação</div>
          <div class="lc-chips">
            <button
              type="button"
              class="lc-chip"
              :class="{ ativo: lancamentoAtual.obsTipo === 'texto' }"
              @click="lancamentoAtual.obsTipo = 'texto'"
            >
              Texto
            </button>
            <button
              type="button"
              class="lc-chip"
              :class="{ ativo: lancamentoAtual.obsTipo === 'audio' }"
              @click="lancamentoAtual.obsTipo = 'audio'"
            >
              Áudio
            </button>
          </div>
          <label v-if="lancamentoAtual.obsTipo === 'texto'" class="lc-campo">
            <textarea
              v-model="lancamentoAtual.obsTexto"
              class="lc-input"
              rows="2"
              placeholder="Ex.: Insumos — farinha e fermento"
            />
          </label>
          <GravadorAudio
            v-else-if="lancamentoAtual.obsTipo === 'audio'"
            v-model="lancamentoAtual.obsAudioPath"
            :fechamento-id="draft.id"
            campo="lancamento-obs-audio"
          />

          <div class="lc-campo lc-mt">
            <CampoFoto
              v-model="lancamentoAtual.fotoPath"
              :fechamento-id="draft.id"
              campo="lancamento-foto"
              label="Foto"
            />
          </div>

          <!-- Pagamento · Data pagamento · Data Vencimento -->
          <div class="lc-tres lc-pagamento lc-mt">
            <label class="lc-campo lc-toggle">
              <span class="lc-campo-lbl">Pagamento</span>
              <button
                type="button"
                class="lc-sn"
                :class="{ sim: lancamentoAtual.status === 'pago' }"
                @click="
                  lancamentoAtual.status = lancamentoAtual.status === 'pago' ? 'naopago' : 'pago'
                "
              >
                {{ lancamentoAtual.status === 'pago' ? 'Sim' : 'Não' }}
              </button>
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Data pagamento</span>
              <input
                v-model="lancamentoAtual.dataPagamento"
                type="date"
                class="lc-input"
                readonly
                :disabled="lancamentoAtual.status !== 'pago'"
              />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Data Vencimento</span>
              <input v-model="lancamentoAtual.vencimento" type="date" class="lc-input" readonly />
            </label>
          </div>

          <div class="lc-campo">
            <CampoFoto
              v-model="lancamentoAtual.fotoNotaPath"
              :fechamento-id="draft.id"
              campo="lancamento-foto-nota"
              label="Foto Nota / Boleto"
            />
          </div>
        </div>

        <div class="lc-acoes">
          <button type="button" class="lc-salvar-nova" @click="remover">Remover</button>
          <button type="button" class="lc-salvar" @click="modalAberto = false">Salvar</button>
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
