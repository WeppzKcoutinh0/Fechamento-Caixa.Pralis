<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  DiscriminacaoDraft,
  FechamentoDraft,
  LancamentoDraft,
  TipoCredor,
  TipoLancamento,
} from '~/types/fechamento';
import {
  GRUPOS_DISCRIMINACAO,
  TIPOS_CREDOR,
  TIPOS_LANCAMENTO,
  TIPOS_MER,
} from '~/types/fechamento';
import CampoFoto from '~/components/comum/CampoFoto.vue';
import CartaoValor from '~/components/comum/CartaoValor.vue';
import GravadorAudio from '~/components/comum/GravadorAudio.vue';
import { useLeituraNotaFiscal } from '~/composables/useLeituraNotaFiscal';
import { usePerfil } from '~/composables/usePerfil';
import {
  calculateDiscrimination,
  calculateValorTotalLancamento,
  formatCents,
} from '~/utils/financeiro';
import { mensagemDeErro } from '~/utils/erros';

const props = defineProps<{ draft: FechamentoDraft }>();
const { perfil } = usePerfil();
const ehUsuarioCaixa = computed(() => perfil.value?.role === 'caixa');

// A foto do lançamento só pode ir pro Storage depois que o fechamento existir no banco (RLS de
// `anexos_insert` exige `fechamento_editavel`, que checa a linha em `fechamentos` — ver migration
// 20260918100800) — por isso usa o mesmo padrão de upload adiado do Maquininhas
// (SecaoRelatorios.vue), com uma chave por lançamento+campo já que pode haver vários lançamentos.
function chaveArquivoLancamento(lancamentoId: string, campo: 'foto' | 'foto-nota'): string {
  return `lancamento-${campo}-${lancamentoId}`;
}
function registrarFotoLancamento(
  lancamentoId: string,
  campo: 'foto' | 'foto-nota',
  arquivo: File,
): void {
  props.draft.arquivosPendentes ??= {};
  props.draft.arquivosPendentes[chaveArquivoLancamento(lancamentoId, campo)] = arquivo;
}
function removerFotoLancamento(lancamentoId: string, campo: 'foto' | 'foto-nota'): void {
  if (props.draft.arquivosPendentes)
    Reflect.deleteProperty(
      props.draft.arquivosPendentes,
      chaveArquivoLancamento(lancamentoId, campo),
    );
}
function arquivoPendenteLancamento(lancamentoId: string, campo: 'foto' | 'foto-nota'): File | null {
  return props.draft.arquivosPendentes?.[chaveArquivoLancamento(lancamentoId, campo)] ?? null;
}

function chaveAudioLancamento(lancamentoId: string): string {
  return `audio-lancamento-obs-${lancamentoId}`;
}
function registrarAudioLancamento(lancamentoId: string, arquivo: File): void {
  props.draft.arquivosPendentes ??= {};
  props.draft.arquivosPendentes[chaveAudioLancamento(lancamentoId)] = arquivo;
}
function removerAudioLancamento(lancamentoId: string): void {
  if (props.draft.arquivosPendentes)
    Reflect.deleteProperty(props.draft.arquivosPendentes, chaveAudioLancamento(lancamentoId));
}
function audioPendenteLancamento(lancamentoId: string): File | null {
  return props.draft.arquivosPendentes?.[chaveAudioLancamento(lancamentoId)] ?? null;
}

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

// Lançamentos Automáticos (pedido do usuário, 21/09/2026): 4 das 5 categorias de "ajuste" que o
// bot já sincroniza (ver AJUSTES_CATEGORIAS/aplicarAjustesComoLancamentos em vendasFechamento.ts)
// ganham um bloco somente-leitura dedicado, abaixo dos lançamentos manuais — Colaborador/Lanches
// em Despesas, Sobra/Perda e Furto/Roubo em Mercadorias. "Sócios" (a 5ª categoria) não tem slot
// automático pedido, então continua aparecendo na lista manual normalmente. Os itens com essas 4
// origens somem da lista MANUAL (já são mostrados no bloco automático) mas continuam gravados em
// `draft.lancamentos` com `tipo: 'despesa'` de sempre — o motor de cálculo real
// (useRelatorioCalculado/calculateLancamentosPorTipo) nunca filtra por `origemAjusteCreare` e
// continua somando todos eles normalmente; isto é só uma mudança de exibição.
const ORIGENS_COM_BLOCO_AUTOMATICO: readonly string[] = [
  'colaboradores',
  'alimentacao',
  'sobraPerda',
  'rouboFurto',
];

function lancamentosPorTipo(tipo: TipoLancamento): LancamentoDraft[] {
  return props.draft.lancamentos.filter(
    (l) => l.tipo === tipo && !ORIGENS_COM_BLOCO_AUTOMATICO.includes(l.origemAjusteCreare),
  );
}
function totalPorTipo(tipo: TipoLancamento): number {
  return lancamentosPorTipo(tipo).reduce(
    (soma, l) => soma + l.valorCents + l.valorAcrescimoCents,
    0,
  );
}

function valorPorOrigem(origem: string): number {
  const lancamento = props.draft.lancamentos.find((l) => l.origemAjusteCreare === origem);
  return lancamento ? lancamento.valorCents + lancamento.valorAcrescimoCents : 0;
}
// Detalhe ao expandir (pedido do usuário, 22/09/2026): os ajustes do CREARE chegam SOMADOS num
// único lançamento por categoria — não existe "por PDV" pra detalhar aqui (diferente das formas
// de pagamento, que vêm de draft.pdvEntradas). O que existe de verdade é o `obsTexto` que já é
// gravado em cada lançamento pra auditoria ("valor original: ±R$X"), com o sinal que o card em
// cima não mostra. Expandir revela essa nota.
function observacaoPorOrigem(origem: string): string {
  const lancamento = props.draft.lancamentos.find((l) => l.origemAjusteCreare === origem);
  return lancamento?.obsTexto || 'Nenhum ajuste sincronizado ainda para esta categoria.';
}
const despesasAutomaticas = computed(() => [
  {
    rotulo: 'COLABORADOR',
    valorCents: valorPorOrigem('colaboradores'),
    observacao: observacaoPorOrigem('colaboradores'),
  },
  {
    rotulo: 'LANCHES',
    valorCents: valorPorOrigem('alimentacao'),
    observacao: observacaoPorOrigem('alimentacao'),
  },
]);
const mercadoriasAutomaticas = computed(() => [
  {
    rotulo: 'SOBRA/PERDA',
    valorCents: valorPorOrigem('sobraPerda'),
    observacao: observacaoPorOrigem('sobraPerda'),
  },
  {
    rotulo: 'FURTO/ROUBO',
    valorCents: valorPorOrigem('rouboFurto'),
    observacao: observacaoPorOrigem('rouboFurto'),
  },
]);
const totalDespesasAutomaticasCents = computed(() =>
  despesasAutomaticas.value.reduce((soma, item) => soma + item.valorCents, 0),
);
const totalMercadoriasAutomaticasCents = computed(() =>
  mercadoriasAutomaticas.value.reduce((soma, item) => soma + item.valorCents, 0),
);

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
    if (props.draft.discriminacoes[i]?.lancamentoId === lancamento.id)
      props.draft.discriminacoes.splice(i, 1);
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

// Leitura por IA dos itens da nota/boleto (pedido do usuário, 22/09/2026): só preenche
// qtd/produto/valor unitário — nunca o "grupo" (categoria), decisão explícita do usuário de
// preferir revisar manualmente a arriscar uma classificação errada. Não sobrescreve itens já
// discriminados: sempre ADICIONA à lista, revisável antes de salvar como o resto da leitura por IA.
const { ler: lerNotaFiscal, lerArquivo: lerArquivoNotaFiscal } = useLeituraNotaFiscal();
const lendoNotaFiscal = ref(false);
const erroLeituraNotaFiscal = ref('');
const avisoLeituraNotaFiscal = ref('');

// O usuário pode anexar a foto da nota tanto no campo "Foto" quanto em "Foto Nota / Boleto" —
// a leitura por IA funciona com qualquer um dos dois, preferindo "Foto Nota / Boleto" quando
// ambos existirem (é o campo com esse propósito mais específico).
function fonteFotoParaDiscriminar(
  lancamento: LancamentoDraft,
): { tipo: 'pendente'; arquivo: File } | { tipo: 'path'; path: string } | null {
  const chaveNota = chaveArquivoLancamento(lancamento.id, 'foto-nota');
  const chaveFoto = chaveArquivoLancamento(lancamento.id, 'foto');
  const pendenteNota = props.draft.arquivosPendentes?.[chaveNota];
  const pendenteFoto = props.draft.arquivosPendentes?.[chaveFoto];

  if (pendenteNota) return { tipo: 'pendente', arquivo: pendenteNota };
  if (lancamento.fotoNotaPath) return { tipo: 'path', path: lancamento.fotoNotaPath };
  if (pendenteFoto) return { tipo: 'pendente', arquivo: pendenteFoto };
  if (lancamento.fotoPath) return { tipo: 'path', path: lancamento.fotoPath };
  return null;
}

function temFotoNotaParaLer(): boolean {
  if (!lancamentoAtual.value) return false;
  return fonteFotoParaDiscriminar(lancamentoAtual.value) !== null;
}

async function lerItensNota(): Promise<void> {
  const lancamento = lancamentoAtual.value;
  if (!lancamento) return;
  const fonte = fonteFotoParaDiscriminar(lancamento);
  if (!fonte) return;

  lendoNotaFiscal.value = true;
  erroLeituraNotaFiscal.value = '';
  avisoLeituraNotaFiscal.value = '';
  try {
    const resultado =
      fonte.tipo === 'pendente'
        ? await lerArquivoNotaFiscal(fonte.arquivo)
        : await lerNotaFiscal(fonte.path);

    if (resultado.fornecedor && !lancamento.fornecedor.trim()) {
      lancamento.fornecedor = resultado.fornecedor;
    }
    for (const item of resultado.itens) {
      props.draft.discriminacoes.push({
        lancamentoId: lancamento.id,
        tipo: lancamento.tipo,
        qtd: item.qtd,
        produto: item.produto,
        grupo: '',
        valUnitCents: item.valUnitCents,
        descontoValCents: 0,
        descontoPct: 0,
      });
    }
    discriminando.value = true;

    const percentual =
      resultado.confianca === null
        ? ''
        : ` Confiança estimada: ${Math.round(resultado.confianca * 100)}%.`;
    avisoLeituraNotaFiscal.value = resultado.itens.length
      ? `${resultado.itens.length} ${resultado.itens.length === 1 ? 'item adicionado' : 'itens adicionados'} à discriminação. Confira o grupo e os valores antes de salvar.${percentual}`
      : `Nenhum item foi lido com segurança nesta imagem.${percentual}`;
    if (resultado.avisos.length) avisoLeituraNotaFiscal.value += ` ${resultado.avisos.join(' ')}`;
  } catch (erro) {
    const mensagemServidor = (erro as { data?: { statusMessage?: string } })?.data?.statusMessage;
    erroLeituraNotaFiscal.value = mensagemServidor || mensagemDeErro(erro, 'Não foi possível ler a nota.');
  } finally {
    lendoNotaFiscal.value = false;
  }
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

// Para o operador de caixa, os itens discriminados são a origem do valor da despesa.
// Assim o valor salvo no fechamento não pode divergir da soma dos itens revisados.
watch(
  [ehUsuarioCaixa, tipoAtual, totalGeralDiscriminacao, () => itensDiscriminacao.value.length],
  () => {
    const lancamento = lancamentoAtual.value;
    if (
      !lancamento ||
      !ehUsuarioCaixa.value ||
      tipoAtual.value !== 'despesa' ||
      itensDiscriminacao.value.length === 0
    )
      return;

    lancamento.valorCents = totalGeralDiscriminacao.value;
    lancamento.valorAcrescimoCents = 0;
  },
  { immediate: true },
);
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <p class="lc-grupo-titulo">Lançamentos Manuais</p>

    <v-expansion-panels variant="accordion" class="cat-accordion">
      <v-expansion-panel
        v-for="tipo in TIPOS_LANCAMENTO"
        :key="tipo"
        class="cat-painel"
        :style="{
          '--cat': `var(--cat-${CAT_TOKEN[tipo]}-base)`,
          '--cat-soft': `var(--cat-${CAT_TOKEN[tipo]}-soft)`,
          '--cat-tinta': `var(--cat-${CAT_TOKEN[tipo]}-tinta)`,
        }"
      >
        <v-expansion-panel-title class="cat-titulo">
          <v-icon size="18" class="mr-2">{{ ICONES_TIPO[tipo] }}</v-icon>
          <span class="flex-grow-1 cat-titulo-rotulo">{{ ROTULOS_TIPO[tipo] }}s</span>
          <strong class="cat-valor">R$ {{ formatCents(totalPorTipo(tipo)) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
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
            <CartaoValor
              :rotulo="`Total ${ROTULOS_TIPO[tipo]}`"
              :valor="`R$ ${formatCents(totalPorTipo(tipo))}`"
            />
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <div class="lc-bloco-automatico">
      <p class="lc-grupo-titulo">Lançamentos Automáticos</p>
      <p class="text-caption text-medium-emphasis mb-0">
        Identificado e somado automaticamente a partir dos ajustes já sincronizados das vendas — sem
        edição manual aqui.
      </p>

      <v-expansion-panels variant="accordion" class="cat-accordion">
        <v-expansion-panel
          class="cat-painel"
          :style="{
            '--cat': 'var(--cat-despesas-base)',
            '--cat-soft': 'var(--cat-despesas-soft)',
            '--cat-tinta': 'var(--cat-despesas-tinta)',
          }"
        >
          <v-expansion-panel-title class="cat-titulo">
            <span class="flex-grow-1">Despesas Automáticas</span>
            <strong class="cat-valor">R$ {{ formatCents(totalDespesasAutomaticasCents) }}</strong>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-expansion-panels variant="accordion" class="cat-subacordeao">
              <v-expansion-panel
                v-for="item in despesasAutomaticas"
                :key="item.rotulo"
                class="cat-subitem"
              >
                <v-expansion-panel-title class="cat-subitem-titulo">
                  <span class="d-flex flex-column">
                    <span class="cat-subitem-rotulo">{{ item.rotulo }}</span>
                    <strong class="cat-subitem-valor">R$ {{ formatCents(item.valorCents) }}</strong>
                  </span>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <p class="text-body-2 text-medium-emphasis mb-0">{{ item.observacao }}</p>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <v-expansion-panel
          class="cat-painel"
          :style="{
            '--cat': 'var(--cat-mercadorias-base)',
            '--cat-soft': 'var(--cat-mercadorias-soft)',
            '--cat-tinta': 'var(--cat-mercadorias-tinta)',
          }"
        >
          <v-expansion-panel-title class="cat-titulo">
            <span class="flex-grow-1">Mercadorias Automáticas</span>
            <strong class="cat-valor"
              >R$ {{ formatCents(totalMercadoriasAutomaticasCents) }}</strong
            >
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-expansion-panels variant="accordion" class="cat-subacordeao">
              <v-expansion-panel
                v-for="item in mercadoriasAutomaticas"
                :key="item.rotulo"
                class="cat-subitem"
              >
                <v-expansion-panel-title class="cat-subitem-titulo">
                  <span class="d-flex flex-column">
                    <span class="cat-subitem-rotulo">{{ item.rotulo }}</span>
                    <strong class="cat-subitem-valor">R$ {{ formatCents(item.valorCents) }}</strong>
                  </span>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <p class="text-body-2 text-medium-emphasis mb-0">{{ item.observacao }}</p>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
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
                :readonly="
                  ehUsuarioCaixa && tipoAtual === 'despesa' && itensDiscriminacao.length > 0
                "
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
                :readonly="
                  ehUsuarioCaixa && tipoAtual === 'despesa' && itensDiscriminacao.length > 0
                "
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

          <!-- Linha 3: Data Lanç · Data Doc Fiscal · Nº Doc Fiscal — Data Lanç/Data Doc. Fiscal
               travadas na data do fechamento (pedido do usuário, 18/09/2026); sem o botão "Hoje"
               de antes, cada campo é só um input[type=date] sozinho — cabe tranquilo nas 3
               colunas iguais padrão do .lc-tres, não precisa mais da largura assimétrica que
               existia só pra caber o botão + campo juntos. -->
          <div class="lc-tres">
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
            <v-alert
              v-if="ehUsuarioCaixa && tipoAtual === 'despesa' && itensDiscriminacao.length > 0"
              type="info"
              variant="tonal"
              density="compact"
              class="mb-3"
            >
              Para usuários de caixa, o valor da despesa é calculado automaticamente pela soma dos
              itens discriminados.
            </v-alert>
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
            <div class="d-flex flex-wrap ga-2 mt-2">
              <button type="button" class="lc-add" @click="adicionarItemDiscriminacao">
                <v-icon size="15">mdi-plus</v-icon> Adicionar item
              </button>
              <v-btn
                v-if="temFotoNotaParaLer()"
                size="small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-auto-fix"
                :loading="lendoNotaFiscal"
                :disabled="lendoNotaFiscal"
                @click="lerItensNota"
              >
                Ler itens com IA
              </v-btn>
            </div>
            <v-alert
              v-if="erroLeituraNotaFiscal"
              class="mt-3"
              type="error"
              variant="tonal"
              density="comfortable"
            >
              {{ erroLeituraNotaFiscal }}
            </v-alert>
            <v-alert
              v-if="avisoLeituraNotaFiscal"
              class="mt-3"
              type="info"
              variant="tonal"
              density="comfortable"
            >
              {{ avisoLeituraNotaFiscal }}
            </v-alert>
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
            :campo="`lancamento-obs-audio-${lancamentoAtual.id}`"
            upload-adiado
            :arquivo-pendente="audioPendenteLancamento(lancamentoAtual.id)"
            @arquivo-selecionado="registrarAudioLancamento(lancamentoAtual.id, $event)"
            @arquivo-removido="removerAudioLancamento(lancamentoAtual.id)"
          />

          <div class="lc-campo lc-mt">
            <CampoFoto
              v-model="lancamentoAtual.fotoPath"
              :fechamento-id="draft.id"
              campo="lancamento-foto"
              label="Foto"
              upload-adiado
              :arquivo-pendente="arquivoPendenteLancamento(lancamentoAtual.id, 'foto')"
              @arquivo-selecionado="registrarFotoLancamento(lancamentoAtual.id, 'foto', $event)"
              @arquivo-removido="removerFotoLancamento(lancamentoAtual.id, 'foto')"
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
              upload-adiado
              :arquivo-pendente="arquivoPendenteLancamento(lancamentoAtual.id, 'foto-nota')"
              @arquivo-selecionado="
                registrarFotoLancamento(lancamentoAtual.id, 'foto-nota', $event)
              "
              @arquivo-removido="removerFotoLancamento(lancamentoAtual.id, 'foto-nota')"
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
.lc-grupo-titulo {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-micro);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* Bloco Automático como zona própria (pedido do usuário, 21/09/2026) — mesma ideia de
   SecaoTransferencias.vue: separa visualmente "editável" (lista manual solta) de "só leitura"
   (grupo com fundo/borda próprios), sem trocar as cores de categoria de cada painel. */
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
