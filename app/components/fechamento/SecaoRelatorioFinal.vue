<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import type { FechamentoDraft, MotivoVendaCanceladaDraft } from '~/types/fechamento';
import CartaoValor from '~/components/comum/CartaoValor.vue';
import { useRelatorioCalculado } from '~/composables/useRelatorioCalculado';
import { useVendasCanceladas, type VendaCancelada } from '~/composables/useVendasCanceladas';
import { useVendasProdutoDia } from '~/composables/useVendasProdutoDia';
import GravadorAudio from '~/components/comum/GravadorAudio.vue';
import CampoFoto from '~/components/comum/CampoFoto.vue';
import { formatCents } from '~/utils/financeiro';
import { baixarPdfFechamento } from '~/utils/gerarPdfFechamento';
import { baixarPdfVendasCanceladas } from '~/utils/gerarPdfVendasCanceladas';
import { abrirWhatsappVendasCanceladas } from '~/utils/whatsappVendasCanceladas';

const props = defineProps<{ draft: FechamentoDraft }>();

const CHAVE_FOTO_FOLHA = 'img-folha-fechamento';

function registrarFotoFolha(arquivo: File): void {
  props.draft.arquivosPendentes ??= {};
  props.draft.arquivosPendentes[CHAVE_FOTO_FOLHA] = arquivo;
}

function removerFotoFolha(): void {
  if (props.draft.arquivosPendentes) {
    Reflect.deleteProperty(props.draft.arquivosPendentes, CHAVE_FOTO_FOLHA);
  }
  props.draft.imgFolhaFechamentoPath = null;
}

const {
  totalEntradaCents,
  totalSaidaCents,
  pdv,
  liqCreditoCents,
  liqDebitoCents,
  liqPixCents,
  liqVoucherCents,
  crediarioTotais,
  lancamentosPorTipo,
  transferenciaSaidaCents,
  transferenciaEntradaCents,
  transferenciasRecebidas,
  lacreAberturaValorCents,
  relatorio,
  fisico,
} = useRelatorioCalculado(toRef(props, 'draft'));

// Notas/Moedas (pedido do usuário, 23/09/2026): dinheiroContadoCents deixa de ser digitado
// direto — vira sempre a soma automática dos dois, atualizada a cada alteração de qualquer um.
function aoAlterarNotasContadas(cents: number): void {
  props.draft.dinheiroContadoNotasCents = cents;
  props.draft.dinheiroContadoCents = cents + props.draft.dinheiroContadoMoedasCents;
}
function aoAlterarMoedasContadas(cents: number): void {
  props.draft.dinheiroContadoMoedasCents = cents;
  props.draft.dinheiroContadoCents = props.draft.dinheiroContadoNotasCents + cents;
}
function aoDigitarCentavos(valorBruto: string | number | null): number {
  const digitos = String(valorBruto ?? '').replace(/\D/g, '');
  return digitos ? parseInt(digitos, 10) : 0;
}

// "Transferência Final" (pedido do usuário, 25/09/2026): mesmo formato visual do modal de
// Transferências (.lc-modal laranja, ver SecaoTransferencias.vue) — contar o dinheiro físico e
// informar o lacre ANTES de revelar o valor esperado/diferença é o ponto: confirmar primeiro,
// comparar depois. Depois de confirmado (dinheiroContadoConfirmado), os campos ficam travados
// (sem botão de reabrir de propósito — pedido explícito do usuário) e só então o "Salvar" do
// wizard libera (ver WizardFechamento.vue).
const modalDinheiroAberto = ref(false);
const DINHEIRO_FINAL_VARS = {
  '--cat': 'var(--cat-transferencias-base)',
  '--cat-soft': 'var(--cat-transferencias-soft)',
  '--cat-faixa': 'var(--cat-transferencias-faixa)',
  '--cat-tinta': 'var(--cat-transferencias-tinta)',
};
// Passo intermediário (pedido do usuário, 25/09/2026): só aparece depois que os DOIS campos
// (Notas e Moedas) forem preenchidos — "tocado" fica true no primeiro input, mesmo que o valor
// final seja 0 (moedas contadas pode legitimamente ser zero). Marcar o checkbox trava só esses
// dois campos; o Lacre final continua editável até a confirmação final (botão lá embaixo).
const notasTocada = ref(false);
const moedasTocada = ref(false);
const mostrarConfirmarValores = computed(
  () => props.draft.dinheiroContadoValoresConfirmados || (notasTocada.value && moedasTocada.value),
);
const valoresContadosTravados = computed(() => props.draft.dinheiroContadoValoresConfirmados);
function confirmarValoresContados(marcado: boolean): void {
  // Só liga — nunca desliga por aqui (pedido explícito do usuário: uma vez marcado, não pode
  // mais mexer). O :disabled no checkbox já impede o clique depois de marcado; isto é reforço.
  if (marcado) props.draft.dinheiroContadoValoresConfirmados = true;
}

const lacreFinalVazio = computed(() => !props.draft.lacreFechamento.trim());
function confirmarDinheiroFinal(): void {
  if (lacreFinalVazio.value || !props.draft.dinheiroContadoValoresConfirmados) return;
  props.draft.dinheiroContadoConfirmado = true;
}
const tomDiferenca = computed<'neutro' | 'positivo' | 'negativo'>(() => {
  const d = fisico.value.differenceCents;
  return d === 0 ? 'neutro' : d > 0 ? 'positivo' : 'negativo';
});
const rotuloDiferenca = computed(() => {
  const d = fisico.value.differenceCents;
  if (d === 0) return 'Igualado (sem diferença)';
  return d > 0 ? 'Sobra (contado − esperado)' : 'Falta (contado − esperado)';
});

// Detalhe do "Esperado na gaveta" (pedido do usuário, 25/09/2026): mesma fórmula do
// calculatePhysicalClosing (ver financeiro.ts) quebrada linha a linha, pra explicar de onde
// veio o número em vez de só mostrar o total. Lacre de abertura entra separado de
// "Transferências recebidas" (mesma separação que fisico.expectedCents já faz por trás, ver
// transferenciaEntradaTotalCents em useRelatorioCalculado.ts) — só aparece quando > 0.
const detalheEsperadoAberto = ref(false);
const detalhesEsperado = computed(() => {
  const itens: { rotulo: string; sinal: '+' | '−'; valorCents: number }[] = [
    { rotulo: 'Dinheiro do PDV', sinal: '+', valorCents: pdv.value.dinheiroCents },
    { rotulo: 'Entradas', sinal: '+', valorCents: totalEntradaCents.value },
    { rotulo: 'Transferências recebidas', sinal: '+', valorCents: transferenciaEntradaCents.value },
  ];
  if (lacreAberturaValorCents.value > 0) {
    itens.push({
      rotulo: 'Lacre de abertura',
      sinal: '+',
      valorCents: lacreAberturaValorCents.value,
    });
  }
  itens.push(
    { rotulo: 'Sangrias', sinal: '−', valorCents: totalSaidaCents.value },
    { rotulo: 'Despesas', sinal: '−', valorCents: lancamentosPorTipo.value.despesaCents },
    { rotulo: 'Mercadorias', sinal: '−', valorCents: lancamentosPorTipo.value.mercadoriaCents },
    { rotulo: 'Retiradas', sinal: '−', valorCents: lancamentosPorTipo.value.retiradaCents },
    { rotulo: 'Transferências enviadas', sinal: '−', valorCents: transferenciaSaidaCents.value },
  );
  return itens;
});

// Geração 100% client-side (jsPDF) — reusa os mesmos valores já calculados acima, não recalcula
// nada por conta própria (ver utils/gerarPdfFechamento.ts). Assíncrona (pedido do usuário,
// 25/09/2026: "todos os produtos" no PDF completo) — busca Produtos/Cancelados antes de gerar,
// mesmo se o usuário nunca abriu esses painéis na tela (aoAbrirProdutos/aoAbrirCancelados já
// pulam a busca se já tiver sido feita, ver os `*JaBuscados` refs).
const gerandoPdf = ref(false);
async function baixarPdf(): Promise<void> {
  gerandoPdf.value = true;
  try {
    await Promise.all([aoAbrirProdutos(), aoAbrirCancelados()]);
    baixarPdfFechamento(props.draft, {
      totalEntradaCents: totalEntradaCents.value,
      totalSaidaCents: totalSaidaCents.value,
      pdvTotalCents: pdv.value.totalCents,
      pdvCreditoCents: pdv.value.creditoCents,
      pdvDebitoCents: pdv.value.debitoCents,
      pdvPixCents: pdv.value.pixCents,
      pdvVoucherCents: pdv.value.voucherCents,
      pdvCrediarioCents: pdv.value.crediarioCents,
      liqCreditoCents: liqCreditoCents.value,
      liqDebitoCents: liqDebitoCents.value,
      liqPixCents: liqPixCents.value,
      liqVoucherCents: liqVoucherCents.value,
      crediarioTotalCents: crediarioTotais.value.totalCents,
      despesasCents: lancamentosPorTipo.value.despesaCents,
      mercadoriasCents: lancamentosPorTipo.value.mercadoriaCents,
      retiradasCents: lancamentosPorTipo.value.retiradaCents,
      relatorio: relatorio.value,
      fisico: fisico.value,
      vendasPorCategoria: vendasPorCategoria.value,
      detalhesEsperado: detalhesEsperado.value,
      produtos: produtos.value,
      produtosCancelados: itensCancelados.value.map((item) => ({
        ...item,
        motivo: props.draft.vendasCanceladasMotivos[item.id],
      })),
    });
  } finally {
    gerandoPdf.value = false;
  }
}

const STATUS_TEXTO = {
  zero: '✔ Caixa fechado sem diferença!',
  sobra: '↑ Sobra',
  falta: '↓ Falta',
};
const STATUS_COR = { zero: 'default', sobra: 'success', falta: 'error' } as const;

function classeDiff(cents: number): 'success' | 'error' | undefined {
  if (Math.abs(cents) < 1) return undefined;
  return cents > 0 ? 'success' : 'error';
}

// "Vendas" expandido nas 9 categorias (pedido do usuário, 21/09/2026) — mesmas 9 do "Tipo de
// conta" da Entrada. As 5 formas de pagamento vêm do PDV (já calculado acima); as outras 4 vêm
// dos lançamentos automáticos que o CREARE já cria (ver aplicarAjustesComoLancamentos em
// utils/vendasFechamento.ts) — procurados pelo mesmo `origemAjusteCreare` que os identifica.
// Lista de PRODUTOS vendidos é uma coisa SEPARADA (não tem ligação com forma de pagamento nem
// caixa na origem — ver useVendasProdutoDia.ts) — fica ao lado, não dentro de cada categoria.
function valorPorAjuste(chave: string): number {
  return props.draft.lancamentos.find((l) => l.origemAjusteCreare === chave)?.valorCents ?? 0;
}
const vendasPorCategoria = computed(() => [
  { rotulo: 'CREDITO', valorCents: pdv.value.creditoCents },
  { rotulo: 'DEBITO', valorCents: pdv.value.debitoCents },
  { rotulo: 'PIX', valorCents: pdv.value.pixCents },
  { rotulo: 'VOUCHER', valorCents: pdv.value.voucherCents },
  { rotulo: 'DINHEIRO', valorCents: pdv.value.dinheiroCents },
  { rotulo: 'COLABORADOR', valorCents: valorPorAjuste('colaboradores') },
  { rotulo: 'SOBRA/PERDA', valorCents: valorPorAjuste('sobraPerda') },
  { rotulo: 'FURTO/ROUBO', valorCents: valorPorAjuste('rouboFurto') },
  { rotulo: 'LANCHES', valorCents: valorPorAjuste('alimentacao') },
]);

const {
  carregando: carregandoProdutos,
  erro: erroProdutos,
  produtos,
  buscarPorData: buscarProdutos,
} = useVendasProdutoDia();
const produtosJaBuscados = ref(false);
async function aoAbrirProdutos(): Promise<void> {
  if (produtosJaBuscados.value) return;
  produtosJaBuscados.value = true;
  await buscarProdutos(props.draft.data);
}
function formatarQtd(qtd: number): string {
  return qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

// Vendas/Produtos Cancelados (pedido do usuário, 23/09/2026, ligado de vez em 24/09/2026) —
// mesmo padrão de carregamento sob demanda de "Produtos vendidos no dia" acima; useVendasCanceladas
// já busca de verdade (tipo='C' em vendas_produto_dia, ver o composable).
const {
  carregando: carregandoCancelados,
  erro: erroCancelados,
  itens: itensCancelados,
  buscarPorData: buscarCancelados,
} = useVendasCanceladas();
const canceladosJaBuscados = ref(false);
async function aoAbrirCancelados(): Promise<void> {
  if (canceladosJaBuscados.value) return;
  canceladosJaBuscados.value = true;
  await buscarCancelados(props.draft.data);
  inicializarMotivosCancelados(itensCancelados.value);
}
function novoMotivoCancelado(): MotivoVendaCanceladaDraft {
  return { tipo: 'texto', texto: '', audioPath: null };
}
function inicializarMotivosCancelados(itens: VendaCancelada[]): void {
  const motivos = props.draft.vendasCanceladasMotivos;
  for (const item of itens) {
    if (!motivos[item.id]) motivos[item.id] = novoMotivoCancelado();
  }
  // Compatibilidade: um fechamento antigo com motivo único transfere esse motivo para
  // o primeiro item cancelado quando a seção for aberta.
  const primeiro = itens[0];
  if (
    primeiro &&
    props.draft.vendasCanceladasMotivoTexto.trim() &&
    Object.values(motivos).every((motivo) => !motivo.texto.trim() && !motivo.audioPath)
  ) {
    motivos[primeiro.id] = {
      tipo: props.draft.vendasCanceladasMotivoTipo,
      texto: props.draft.vendasCanceladasMotivoTexto,
      audioPath: props.draft.vendasCanceladasMotivoAudioPath,
    };
  }
}
function motivoDoItem(item: VendaCancelada): MotivoVendaCanceladaDraft {
  if (!props.draft.vendasCanceladasMotivos[item.id]) {
    props.draft.vendasCanceladasMotivos[item.id] = novoMotivoCancelado();
  }
  return props.draft.vendasCanceladasMotivos[item.id]!;
}
const textoMotivoAbertoId = ref<string | null>(null);
const audioMotivoAbertoId = ref<string | null>(null);
const textoMotivoEdicao = ref('');

function abrirTextoMotivo(item: VendaCancelada): void {
  audioMotivoAbertoId.value = null;
  textoMotivoEdicao.value = motivoDoItem(item).texto;
  textoMotivoAbertoId.value = textoMotivoAbertoId.value === item.id ? null : item.id;
}

function salvarTextoMotivo(item: VendaCancelada): void {
  const motivo = motivoDoItem(item);
  motivo.tipo = 'texto';
  motivo.texto = textoMotivoEdicao.value.trim();
  textoMotivoAbertoId.value = null;
}

function abrirAudioMotivo(item: VendaCancelada): void {
  textoMotivoAbertoId.value = null;
  audioMotivoAbertoId.value = audioMotivoAbertoId.value === item.id ? null : item.id;
  motivoDoItem(item).tipo = 'audio';
}
function chaveAudioMotivo(itemId: string): string {
  return `audio-vendas-canceladas-motivo-${itemId}`;
}
function registrarAudioMotivo(itemId: string, arquivo: File): void {
  props.draft.arquivosPendentes ??= {};
  props.draft.arquivosPendentes[chaveAudioMotivo(itemId)] = arquivo;
}
function removerAudioMotivo(itemId: string): void {
  if (props.draft.arquivosPendentes)
    Reflect.deleteProperty(props.draft.arquivosPendentes, chaveAudioMotivo(itemId));
}
function audioPendenteMotivo(itemId: string): File | null {
  return props.draft.arquivosPendentes?.[chaveAudioMotivo(itemId)] ?? null;
}
const totalCanceladosCents = computed(() =>
  itensCancelados.value.reduce((soma, i) => soma + i.totalCents, 0),
);
function baixarPdfCancelados(): void {
  baixarPdfVendasCanceladas(props.draft, itensCancelados.value);
}
function enviarWhatsappCancelados(): void {
  abrirWhatsappVendasCanceladas(props.draft, itensCancelados.value);
}

// Relatório em accordion por categoria (pedido do usuário, 21/09/2026, réplica da estrutura do
// "RELATORIO" da planilha antiga do Pralís: Venda/Transferências/Despesas/Mercadorias/Retiradas/
// Diferença, cada uma clicável pra expandir o detalhe). A planilha antiga tinha, dentro de
// Transferências, um mecanismo de ESCOLHER manualmente uma "conta destino" (CT CX1/CT Fluxo
// Cartões/CT Cofre) por lançamento — isso é um motor de roteamento contábil à parte, não existe
// nesta versão (decisão confirmada com o usuário: reaproveitar só a estrutura de categorias que
// JÁ existe no app, sem esse roteamento manual).
const totalTransferidoEntreCaixasCents = computed(() =>
  props.draft.transferenciasCaixa.reduce((soma, t) => soma + t.valorCents, 0),
);

// Mesma soma de draft.pdvEntradas usada em SecaoTransferencias.vue — não repete busca nenhuma,
// só lê o que "Buscar vendas" já gravou (idempotente, nunca duplica).
type CampoPdv =
  'dinheiroCents' | 'creditoCents' | 'debitoCents' | 'pixCents' | 'voucherCents' | 'crediarioCents';
function somaPdv(campo: CampoPdv): number {
  return props.draft.pdvEntradas.reduce((soma, p) => soma + p[campo], 0);
}
// Detalhe por PDV (pedido do usuário, 22/09/2026) — mesma ideia de SecaoTransferencias.vue:
// clicar num card individual expande mostrando quanto cada PDV da Seção 1 contribuiu.
function detalhesPorPdv(campo: CampoPdv): { rotulo: string; valorCents: number }[] {
  return props.draft.pdvEntradas.map((p, i) => ({ rotulo: `PDV ${i + 1}`, valorCents: p[campo] }));
}
const transferenciasAutomaticas = computed(() => [
  {
    rotulo: 'CREDITO',
    valorCents: somaPdv('creditoCents'),
    detalhes: detalhesPorPdv('creditoCents'),
  },
  { rotulo: 'DEBITO', valorCents: somaPdv('debitoCents'), detalhes: detalhesPorPdv('debitoCents') },
  { rotulo: 'PIX', valorCents: somaPdv('pixCents'), detalhes: detalhesPorPdv('pixCents') },
  {
    rotulo: 'VOUCHER',
    valorCents: somaPdv('voucherCents'),
    detalhes: detalhesPorPdv('voucherCents'),
  },
  {
    rotulo: 'DINHEIRO',
    valorCents: somaPdv('dinheiroCents'),
    detalhes: detalhesPorPdv('dinheiroCents'),
  },
  {
    rotulo: 'CREDIARIO',
    valorCents: somaPdv('crediarioCents'),
    detalhes: detalhesPorPdv('crediarioCents'),
  },
  ...(lacreAberturaValorCents.value > 0
    ? [
        {
          rotulo: 'TRANSFERÊNCIAS DE ENTRADA',
          valorCents: lacreAberturaValorCents.value,
          detalhes: [
            {
              rotulo: `Lacre ${props.draft.lacreAbertura}`,
              valorCents: lacreAberturaValorCents.value,
            },
          ],
        },
      ]
    : []),
  ...transferenciasRecebidas.value.map((r) => ({
    rotulo: r.caixaOrigem.toUpperCase(),
    valorCents: r.valorCents,
    detalhes: [{ rotulo: `Recebido de ${r.caixaOrigem}`, valorCents: r.valorCents }],
  })),
]);

// Mesmo filtro de SecaoLancamentos.vue: os 4 ajustes com bloco automático dedicado somem da
// lista MANUAL (já aparecem no bloco automático abaixo), mas continuam com `tipo: 'despesa'` /
// `'mercadoria'` de sempre — o motor de cálculo (lancamentosPorTipo acima) não filtra por
// origemAjusteCreare e continua somando todos eles normalmente.
const ORIGENS_COM_BLOCO_AUTOMATICO: readonly string[] = [
  'colaboradores',
  'alimentacao',
  'sobraPerda',
  'rouboFurto',
];
const despesasManuais = computed(() =>
  props.draft.lancamentos.filter(
    (l) => l.tipo === 'despesa' && !ORIGENS_COM_BLOCO_AUTOMATICO.includes(l.origemAjusteCreare),
  ),
);
const mercadoriasManuais = computed(() =>
  props.draft.lancamentos.filter(
    (l) => l.tipo === 'mercadoria' && !ORIGENS_COM_BLOCO_AUTOMATICO.includes(l.origemAjusteCreare),
  ),
);
const retiradas = computed(() => props.draft.lancamentos.filter((l) => l.tipo === 'retirada'));

// Detalhe ao expandir (pedido do usuário, 22/09/2026): diferente das formas de pagamento
// (draft.pdvEntradas guarda um valor por PDV), os ajustes do CREARE já chegam SOMADOS num único
// lançamento por categoria (aplicarAjustesComoLancamentos, ver utils/vendasFechamento.ts) — não
// existe "por PDV" pra detalhar aqui. O que existe de verdade é o `obsTexto` que essa função já
// grava em cada lançamento pra auditoria ("valor original: ±R$X"), incluindo o sinal (sobra é
// diferente de perda) que o card em cima não mostra. Expandir revela essa nota.
function observacaoPorAjuste(chave: string): string {
  const lancamento = props.draft.lancamentos.find((l) => l.origemAjusteCreare === chave);
  return lancamento?.obsTexto || 'Nenhum ajuste sincronizado ainda para esta categoria.';
}
const despesasAutomaticas = computed(() => [
  {
    rotulo: 'COLABORADOR',
    valorCents: valorPorAjuste('colaboradores'),
    observacao: observacaoPorAjuste('colaboradores'),
  },
  {
    rotulo: 'LANCHES',
    valorCents: valorPorAjuste('alimentacao'),
    observacao: observacaoPorAjuste('alimentacao'),
  },
]);
const mercadoriasAutomaticas = computed(() => [
  {
    rotulo: 'SOBRA/PERDA',
    valorCents: valorPorAjuste('sobraPerda'),
    observacao: observacaoPorAjuste('sobraPerda'),
  },
  {
    rotulo: 'FURTO/ROUBO',
    valorCents: valorPorAjuste('rouboFurto'),
    observacao: observacaoPorAjuste('rouboFurto'),
  },
]);

const CAT_VARS = {
  venda: {
    '--cat': 'var(--cat-venda-base)',
    '--cat-soft': 'var(--cat-venda-soft)',
    '--cat-tinta': 'var(--cat-venda-tinta)',
  },
  transferencias: {
    '--cat': 'var(--cat-transferencias-base)',
    '--cat-soft': 'var(--cat-transferencias-soft)',
    '--cat-tinta': 'var(--cat-transferencias-tinta)',
  },
  despesas: {
    '--cat': 'var(--cat-despesas-base)',
    '--cat-soft': 'var(--cat-despesas-soft)',
    '--cat-tinta': 'var(--cat-despesas-tinta)',
  },
  mercadorias: {
    '--cat': 'var(--cat-mercadorias-base)',
    '--cat-soft': 'var(--cat-mercadorias-soft)',
    '--cat-tinta': 'var(--cat-mercadorias-tinta)',
  },
  retiradas: {
    '--cat': 'var(--cat-retiradas-base)',
    '--cat-soft': 'var(--cat-retiradas-soft)',
    '--cat-tinta': 'var(--cat-retiradas-tinta)',
  },
  resultado: {
    '--cat': 'var(--cat-resultado-base)',
    '--cat-soft': 'var(--cat-resultado-soft)',
    '--cat-tinta': 'var(--cat-resultado-tinta)',
  },
  cancelados: {
    '--cat': 'var(--cat-cancelados-base)',
    '--cat-soft': 'var(--cat-cancelados-soft)',
    '--cat-tinta': 'var(--cat-cancelados-tinta)',
  },
} as const;
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <v-btn
      color="primary"
      variant="tonal"
      prepend-icon="mdi-file-pdf-box"
      class="align-self-start"
      :loading="gerandoPdf"
      :disabled="gerandoPdf"
      @click="baixarPdf"
    >
      Baixar PDF
    </v-btn>

    <v-card
      :color="STATUS_COR[relatorio.status]"
      :variant="relatorio.status === 'zero' ? 'outlined' : 'tonal'"
      class="pa-4"
      rounded="lg"
    >
      <div class="text-caption">Diferença Geral</div>
      <div class="text-h5">R$ {{ formatCents(Math.abs(relatorio.diferencaCents)) }}</div>
      <div class="text-body-2">
        {{ STATUS_TEXTO[relatorio.status]
        }}{{
          relatorio.status !== 'zero'
            ? ` de R$ ${formatCents(Math.abs(relatorio.diferencaCents))}`
            : ''
        }}
      </div>
    </v-card>

    <div class="grade-cartoes">
      <CartaoValor rotulo="Cartões" :valor="`R$ ${formatCents(relatorio.cartoesCents)}`" />
      <CartaoValor
        rotulo="Rel. PDV Diferença"
        :valor="`R$ ${formatCents(relatorio.relPdvDiferencaCents)}`"
      />
    </div>

    <!-- Relatório em categorias clicáveis (pedido do usuário, 21/09/2026) — réplica da estrutura
         VENDA/TRANSFERÊNCIAS/DESPESAS/MERCADORIAS/RETIRADAS/DIFERENÇA da planilha antiga do
         Pralís: clicar numa categoria expande o detalhe dela. -->
    <v-expansion-panels variant="accordion" class="cat-accordion">
      <v-expansion-panel class="cat-painel" :style="CAT_VARS.venda">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Venda</span>
          <strong class="cat-valor">R$ {{ formatCents(relatorio.valorTotalFinalCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="d-flex flex-column ga-2 mb-4">
            <div
              v-for="cat in vendasPorCategoria"
              :key="cat.rotulo"
              class="d-flex justify-space-between text-body-2"
            >
              <span class="text-medium-emphasis">{{ cat.rotulo }}</span>
              <strong>R$ {{ formatCents(cat.valorCents) }}</strong>
            </div>
          </div>

          <v-expansion-panels variant="accordion">
            <v-expansion-panel @group:selected="({ value }) => value && aoAbrirProdutos()">
              <v-expansion-panel-title>Produtos vendidos no dia</v-expansion-panel-title>
              <v-expansion-panel-text>
                <p class="text-caption text-medium-emphasis mb-3">
                  Loja inteira (não separado por caixa) — a origem dos dados não liga produto a
                  caixa/turno. Vendas de hoje só aparecem depois que o bot da loja rodar à noite
                  (22h10).
                </p>
                <div v-if="carregandoProdutos" class="d-flex justify-center py-4">
                  <v-progress-circular indeterminate color="primary" size="24" />
                </div>
                <v-alert
                  v-else-if="erroProdutos"
                  type="error"
                  variant="tonal"
                  density="comfortable"
                  >{{ erroProdutos }}</v-alert
                >
                <v-alert
                  v-else-if="produtos.length === 0"
                  type="info"
                  variant="tonal"
                  density="comfortable"
                >
                  Nenhum produto sincronizado para {{ draft.data }}.
                </v-alert>
                <div v-else class="tabela-produtos-wrap">
                  <table class="tabela-produtos">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th class="text-right">Quant.</th>
                        <th class="text-right">V. Unit.</th>
                        <th class="text-right">V. Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(p, i) in produtos" :key="`${p.produtoCodigo}-${i}`">
                        <td>{{ p.produto }}</td>
                        <td class="text-right">{{ formatarQtd(p.quantidade) }}</td>
                        <td class="text-right">R$ {{ formatCents(p.valorUnitarioCents) }}</td>
                        <td class="text-right">R$ {{ formatCents(p.totalCents) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel
        class="cat-painel"
        :style="CAT_VARS.cancelados"
        @group:selected="({ value }) => value && aoAbrirCancelados()"
      >
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Vendas/Produtos Cancelados</span>
          <strong class="cat-valor">R$ {{ formatCents(totalCanceladosCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="cat-subgrupo">Itens cancelados</p>
          <div v-if="carregandoCancelados" class="d-flex justify-center py-4">
            <v-progress-circular indeterminate color="primary" size="24" />
          </div>
          <v-alert v-else-if="erroCancelados" type="error" variant="tonal" density="comfortable">
            {{ erroCancelados }}
          </v-alert>
          <v-alert
            v-else-if="!itensCancelados.length"
            type="info"
            variant="tonal"
            density="comfortable"
          >
            Nenhum item cancelado para {{ draft.data }}.
          </v-alert>
          <div v-else class="d-flex flex-column ga-3 mb-2">
            <div v-for="item in itensCancelados" :key="item.id" class="cancelado-item">
              <div class="d-flex justify-space-between text-body-2 mb-2">
                <span class="text-medium-emphasis">
                  {{ item.produto }} ({{ formatarQtd(item.quantidade) }})
                  <template v-if="item.horaVenda"> — {{ item.horaVenda.slice(0, 5) }}</template>
                </span>
                <strong>R$ {{ formatCents(item.totalCents) }}</strong>
                <div class="d-flex align-center ga-1 ml-2">
                  <v-badge
                    :model-value="Boolean(motivoDoItem(item).texto)"
                    content="1"
                    color="primary"
                    offset-x="5"
                    offset-y="5"
                  >
                    <v-btn
                      icon="mdi-chat-outline"
                      size="x-small"
                      variant="text"
                      :color="motivoDoItem(item).texto ? 'primary' : undefined"
                      aria-label="Informar motivo em texto"
                      @click.stop="abrirTextoMotivo(item)"
                    />
                  </v-badge>
                  <v-btn
                    icon="mdi-microphone-outline"
                    size="x-small"
                    variant="text"
                    :color="motivoDoItem(item).audioPath ? 'primary' : undefined"
                    aria-label="Informar motivo em áudio"
                    @click.stop="abrirAudioMotivo(item)"
                  />
                  <span
                    v-if="motivoDoItem(item).audioPath"
                    class="motivo-notificacao"
                    aria-label="Áudio registrado"
                    >1</span
                  >
                </div>
              </div>
              <div v-if="textoMotivoAbertoId === item.id" class="motivo-editor mt-2">
                <v-textarea
                  v-model="textoMotivoEdicao"
                  label="Escreva o motivo deste produto"
                  rows="2"
                  auto-grow
                  autofocus
                  hide-details
                />
                <div class="d-flex justify-end ga-2 mt-2">
                  <v-btn size="small" variant="text" @click="textoMotivoAbertoId = null"
                    >Cancelar</v-btn
                  >
                  <v-btn
                    size="small"
                    color="primary"
                    variant="flat"
                    @click="salvarTextoMotivo(item)"
                    >Salvar</v-btn
                  >
                </div>
              </div>
              <div v-if="audioMotivoAbertoId === item.id" class="motivo-editor mt-2">
                <GravadorAudio
                  :model-value="motivoDoItem(item).audioPath"
                  :transcricao="motivoDoItem(item).texto"
                  :fechamento-id="draft.id"
                  :campo="`vendas-canceladas-motivo-${item.id}`"
                  upload-adiado
                  :arquivo-pendente="audioPendenteMotivo(item.id)"
                  @update:model-value="motivoDoItem(item).audioPath = $event"
                  @update:transcricao="motivoDoItem(item).texto = $event"
                  @arquivo-selecionado="registrarAudioMotivo(item.id, $event)"
                  @arquivo-removido="removerAudioMotivo(item.id)"
                />
                <v-textarea
                  v-if="motivoDoItem(item).texto"
                  :model-value="motivoDoItem(item).texto"
                  label="Transcrição do áudio"
                  rows="2"
                  auto-grow
                  readonly
                  hide-details
                  class="mt-2"
                />
                <v-btn size="small" variant="text" class="mt-2" @click="audioMotivoAbertoId = null"
                  >Fechar</v-btn
                >
              </div>
            </div>
          </div>

          <div class="d-flex flex-wrap ga-2 mt-3">
            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-file-pdf-box"
              @click="baixarPdfCancelados"
            >
              Exportar PDF
            </v-btn>
            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-whatsapp"
              @click="enviarWhatsappCancelados"
            >
              Enviar por WhatsApp
            </v-btn>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel class="cat-painel" :style="CAT_VARS.transferencias">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Transferências</span>
          <strong class="cat-valor"
            >R$
            {{
              formatCents(
                totalEntradaCents -
                  totalSaidaCents +
                  transferenciaEntradaCents +
                  lacreAberturaValorCents -
                  transferenciaSaidaCents,
              )
            }}</strong
          >
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="cat-subgrupo">Manuais</p>
          <div class="d-flex flex-column ga-2 mb-4">
            <div class="d-flex justify-space-between text-body-2">
              <span class="text-medium-emphasis">Total Entrada</span>
              <strong>R$ {{ formatCents(totalEntradaCents) }}</strong>
            </div>
            <div class="d-flex justify-space-between text-body-2">
              <span class="text-medium-emphasis">Total Saída / Sangria</span>
              <strong>R$ {{ formatCents(totalSaidaCents) }}</strong>
            </div>
            <div class="d-flex justify-space-between text-body-2">
              <span class="text-medium-emphasis">Total Transferido entre caixas</span>
              <strong>R$ {{ formatCents(totalTransferidoEntreCaixasCents) }}</strong>
            </div>
            <div class="d-flex justify-space-between text-body-2">
              <span class="text-medium-emphasis"
                >↳ Saída confirmada deste caixa (conta na Diferença)</span
              >
              <strong>R$ {{ formatCents(transferenciaSaidaCents) }}</strong>
            </div>
          </div>
          <p class="cat-subgrupo">Automáticas</p>
          <v-expansion-panels variant="accordion" class="cat-subacordeao">
            <v-expansion-panel
              v-for="item in transferenciasAutomaticas"
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

      <v-expansion-panel class="cat-painel" :style="CAT_VARS.despesas">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Despesas</span>
          <strong class="cat-valor">R$ {{ formatCents(lancamentosPorTipo.despesaCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="cat-subgrupo">Manuais</p>
          <div v-if="!despesasManuais.length" class="text-caption text-medium-emphasis mb-4">
            Nenhuma despesa manual lançada.
          </div>
          <div v-else class="d-flex flex-column ga-2 mb-4">
            <div
              v-for="d in despesasManuais"
              :key="d.id"
              class="d-flex justify-space-between text-body-2"
            >
              <span class="text-medium-emphasis">{{ d.fornecedor || 'Sem credor' }}</span>
              <strong>R$ {{ formatCents(d.valorCents + d.valorAcrescimoCents) }}</strong>
            </div>
          </div>
          <p class="cat-subgrupo">Automáticas</p>
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

      <v-expansion-panel class="cat-painel" :style="CAT_VARS.mercadorias">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Mercadorias</span>
          <strong class="cat-valor"
            >R$ {{ formatCents(lancamentosPorTipo.mercadoriaCents) }}</strong
          >
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="cat-subgrupo">Manuais</p>
          <div v-if="!mercadoriasManuais.length" class="text-caption text-medium-emphasis mb-4">
            Nenhuma mercadoria manual lançada.
          </div>
          <div v-else class="d-flex flex-column ga-2 mb-4">
            <div
              v-for="m in mercadoriasManuais"
              :key="m.id"
              class="d-flex justify-space-between text-body-2"
            >
              <span class="text-medium-emphasis">{{ m.fornecedor || 'Sem credor' }}</span>
              <strong>R$ {{ formatCents(m.valorCents + m.valorAcrescimoCents) }}</strong>
            </div>
          </div>
          <p class="cat-subgrupo">Automáticas</p>
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

      <v-expansion-panel class="cat-painel" :style="CAT_VARS.retiradas">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Retiradas</span>
          <strong class="cat-valor">R$ {{ formatCents(lancamentosPorTipo.retiradaCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div v-if="!retiradas.length" class="text-caption text-medium-emphasis">
            Nenhuma retirada lançada.
          </div>
          <div v-else class="d-flex flex-column ga-2">
            <div
              v-for="r in retiradas"
              :key="r.id"
              class="d-flex justify-space-between text-body-2"
            >
              <span class="text-medium-emphasis">{{ r.fornecedor || 'Sem credor' }}</span>
              <strong>R$ {{ formatCents(r.valorCents + r.valorAcrescimoCents) }}</strong>
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <v-expansion-panel class="cat-painel" :style="CAT_VARS.resultado">
        <v-expansion-panel-title class="cat-titulo">
          <span class="flex-grow-1">Diferença</span>
          <strong class="cat-valor">R$ {{ formatCents(relatorio.diferencaCents) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="cat-subgrupo">Conferência por forma de pagamento</p>
          <v-card
            v-for="forma in ['Crédito', 'Débito', 'Pix', 'Voucher', 'Crediário'] as const"
            :key="forma"
            variant="outlined"
            class="pa-3 mb-2"
            rounded="lg"
          >
            <div class="text-caption text-medium-emphasis mb-1">{{ forma }}</div>
            <div class="d-flex justify-space-between text-body-2">
              <span
                >Final: R$
                {{
                  formatCents(
                    forma === 'Crédito'
                      ? liqCreditoCents
                      : forma === 'Débito'
                        ? liqDebitoCents
                        : forma === 'Pix'
                          ? liqPixCents
                          : forma === 'Voucher'
                            ? liqVoucherCents
                            : crediarioTotais.totalCents,
                  )
                }}</span
              >
              <span
                >PDV: R$
                {{
                  formatCents(
                    forma === 'Crédito'
                      ? pdv.creditoCents
                      : forma === 'Débito'
                        ? pdv.debitoCents
                        : forma === 'Pix'
                          ? pdv.pixCents
                          : forma === 'Voucher'
                            ? pdv.voucherCents
                            : pdv.crediarioCents,
                  )
                }}</span
              >
            </div>
            <v-chip
              size="small"
              class="mt-1"
              :color="
                classeDiff(
                  forma === 'Crédito'
                    ? relatorio.diffCreditoCents
                    : forma === 'Débito'
                      ? relatorio.diffDebitoCents
                      : forma === 'Pix'
                        ? relatorio.diffPixCents
                        : forma === 'Voucher'
                          ? relatorio.diffVoucherCents
                          : relatorio.diffCrediarioCents,
                )
              "
            >
              Diferença: R$
              {{
                formatCents(
                  forma === 'Crédito'
                    ? relatorio.diffCreditoCents
                    : forma === 'Débito'
                      ? relatorio.diffDebitoCents
                      : forma === 'Pix'
                        ? relatorio.diffPixCents
                        : forma === 'Voucher'
                          ? relatorio.diffVoucherCents
                          : relatorio.diffCrediarioCents,
                )
              }}
            </v-chip>
          </v-card>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <v-divider />
    <p class="lc-grupo-titulo">Transferência Final</p>
    <p class="text-caption text-medium-emphasis mt-n1">
      Conte o dinheiro físico da gaveta e informe o lacre — o valor esperado só aparece depois de
      confirmar, pra não influenciar a contagem.
    </p>

    <button
      type="button"
      class="lc-resumo-item"
      :style="DINHEIRO_FINAL_VARS"
      @click="modalDinheiroAberto = true"
    >
      <span class="lc-resumo-ic"><v-icon icon="mdi-cash-check" size="18" /></span>
      <span class="lc-resumo-corpo">
        <span class="lc-resumo-titulo">
          Transferência Final
          <template v-if="draft.dinheiroContadoConfirmado"
            >— Lacre {{ draft.lacreFechamento }}</template
          >
        </span>
        <span class="lc-resumo-valor">
          <template v-if="draft.dinheiroContadoConfirmado">
            R$ {{ formatCents(draft.dinheiroContadoCents) }}
          </template>
          <template v-else>Toque para informar o lacre final e os valores contados</template>
        </span>
      </span>
    </button>

    <CartaoValor
      v-if="draft.dinheiroContadoConfirmado"
      class="mt-3"
      :rotulo="rotuloDiferenca"
      :valor="`R$ ${formatCents(fisico.differenceCents)}`"
      :tom="tomDiferenca"
    />

    <v-dialog v-model="modalDinheiroAberto" max-width="480">
      <div class="lc-modal" :style="DINHEIRO_FINAL_VARS">
        <div class="lc-faixa">
          <div class="lc-head">
            <span class="lc-ic"><v-icon size="19">mdi-cash-check</v-icon></span>
            <span class="lc-titulo">Transferência Final</span>
            <v-icon class="lc-x" size="19" @click="modalDinheiroAberto = false">mdi-close</v-icon>
          </div>
        </div>

        <div class="lc-corpo">
          <p class="text-caption text-medium-emphasis mb-3">
            Conte o dinheiro físico da gaveta e informe o lacre do malote antes de confirmar — o
            valor esperado só aparece depois, pra não influenciar a contagem.
          </p>

          <div class="lc-hero">
            <span class="lc-cifra">R$</span>
            <span class="lc-valor">
              <input
                :value="formatCents(draft.dinheiroContadoCents)"
                readonly
                aria-label="Valor total contado"
              />
            </span>
          </div>

          <div class="lc-dois">
            <label class="lc-campo">
              <span class="lc-campo-lbl">Valor em Notas</span>
              <input
                :value="formatCents(draft.dinheiroContadoNotasCents)"
                class="lc-input"
                :class="{ 'lc-input-ro': valoresContadosTravados }"
                :readonly="valoresContadosTravados"
                inputmode="decimal"
                @input="
                  notasTocada = true;
                  aoAlterarNotasContadas(
                    aoDigitarCentavos(($event.target as HTMLInputElement).value),
                  );
                "
              />
            </label>
            <label class="lc-campo">
              <span class="lc-campo-lbl">Valor em Moedas</span>
              <input
                :value="formatCents(draft.dinheiroContadoMoedasCents)"
                class="lc-input"
                :class="{ 'lc-input-ro': valoresContadosTravados }"
                :readonly="valoresContadosTravados"
                inputmode="decimal"
                @input="
                  moedasTocada = true;
                  aoAlterarMoedasContadas(
                    aoDigitarCentavos(($event.target as HTMLInputElement).value),
                  );
                "
              />
            </label>
          </div>

          <label v-if="mostrarConfirmarValores" class="lc-confirmar-valores">
            <input
              type="checkbox"
              :checked="valoresContadosTravados"
              :disabled="valoresContadosTravados"
              @change="confirmarValoresContados(($event.target as HTMLInputElement).checked)"
            />
            <span>Confirma esses valores contados?</span>
          </label>

          <label class="lc-campo">
            <span class="lc-campo-lbl">N° Lacre final</span>
            <input
              v-model="draft.lacreFechamento"
              class="lc-input"
              :class="{
                'lc-input-erro': lacreFinalVazio,
                'lc-input-ro': draft.dinheiroContadoConfirmado,
              }"
              :readonly="draft.dinheiroContadoConfirmado"
              placeholder="000000"
            />
          </label>
          <p v-if="lacreFinalVazio" class="lc-erro-campo">
            Informe o N° do lacre do malote pra poder confirmar.
          </p>
          <p v-else class="text-caption text-medium-emphasis" style="margin: -6px 0 10px">
            Identifica o malote que leva esse dinheiro de volta ao cofre — sobe junto pro
            administrador conferir.
          </p>

          <CampoFoto
            v-model="draft.imgFolhaFechamentoPath"
            :fechamento-id="draft.id"
            campo="img-folha-fechamento"
            label="Folha de fechamento de caixa"
            upload-adiado
            :arquivo-pendente="draft.arquivosPendentes?.[CHAVE_FOTO_FOLHA] ?? null"
            @arquivo-selecionado="registrarFotoFolha"
            @arquivo-removido="removerFotoFolha"
          />

          <template v-if="draft.dinheiroContadoConfirmado">
            <v-divider class="my-3" />
            <div
              class="d-flex justify-space-between align-center text-body-2 mb-1"
              style="cursor: pointer"
              @click="detalheEsperadoAberto = !detalheEsperadoAberto"
            >
              <span class="text-medium-emphasis d-flex align-center ga-1">
                Esperado na gaveta
                <v-icon size="16">{{
                  detalheEsperadoAberto ? 'mdi-chevron-up' : 'mdi-chevron-down'
                }}</v-icon>
              </span>
              <strong>R$ {{ formatCents(fisico.expectedCents) }}</strong>
            </div>
            <div v-if="detalheEsperadoAberto" class="lc-detalhe-esperado mb-2">
              <div
                v-for="item in detalhesEsperado"
                :key="item.rotulo"
                class="d-flex justify-space-between"
              >
                <span class="text-medium-emphasis">{{ item.sinal }} {{ item.rotulo }}</span>
                <span>R$ {{ formatCents(item.valorCents) }}</span>
              </div>
            </div>
            <CartaoValor
              :rotulo="rotuloDiferenca"
              :valor="`R$ ${formatCents(fisico.differenceCents)}`"
              :tom="tomDiferenca"
            />
          </template>
        </div>

        <div class="lc-acoes">
          <button
            v-if="!draft.dinheiroContadoConfirmado"
            type="button"
            class="lc-salvar"
            :disabled="lacreFinalVazio || !draft.dinheiroContadoValoresConfirmados"
            @click="confirmarDinheiroFinal"
          >
            Confirmar
          </button>
          <button v-else type="button" class="lc-salvar" @click="modalDinheiroAberto = false">
            Fechar
          </button>
        </div>
      </div>
    </v-dialog>
  </div>
</template>

<style scoped>
/* .cat-* (accordion por categoria colorida) agora vive em assets/main.css — era só daqui
   ("scoped"), então nunca aplicava nos accordions equivalentes de outras telas (mesmo bug já
   corrigido uma vez com .lc-painel/.lc-painel-corpo). */

.tabela-produtos-wrap {
  overflow-x: auto;
}
.tabela-produtos {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--cx-fs-caption);
}
.tabela-produtos th {
  padding: var(--cx-sp-2) var(--cx-sp-3);
  color: var(--cx-ink-soft, rgba(0, 0, 0, 0.6));
  font-weight: 700;
  text-align: left;
  border-bottom: 1px solid var(--cx-border, rgba(0, 0, 0, 0.12));
  white-space: nowrap;
}
.tabela-produtos td {
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border-bottom: 1px solid var(--cx-border, rgba(0, 0, 0, 0.08));
  white-space: nowrap;
}

.cancelado-item {
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-border, rgba(0, 0, 0, 0.12));
  border-radius: var(--cx-r-md, 10px);
}

.motivo-editor {
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-md, 10px);
  background: var(--cx-surface-sunken, rgba(0, 0, 0, 0.03));
}

.motivo-notificacao {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: -6px;
  border-radius: 999px;
  background: var(--v-theme-primary);
  color: white;
  font-size: 10px;
  font-weight: 700;
}

/* Detalhe do "Esperado na gaveta" (pedido do usuário, 25/09/2026) — pequeno de propósito, é só
   uma conferência a mais, não um bloco novo de destaque. */
.lc-detalhe-esperado {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-left: 2px solid var(--cx-line);
  font-size: var(--cx-fs-micro);
}
</style>
