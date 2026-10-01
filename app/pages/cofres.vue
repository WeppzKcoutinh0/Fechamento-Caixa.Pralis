<script setup lang="ts">
// Cofres centrais (pedido do usuário, 23/09/2026): Caixa Principal, Caixa de Troco e Fluxo —
// ciclo descrito pelo usuário: CAIXA PRINCIPAL → CAIXA DE TROCO → CAIXAS/FLUXO → CONFERÊNCIA →
// (parte fica no Fluxo, parte volta pro Principal) → recomeça. Três conceitos NOVOS,
// independentes do "Cofre" genérico que já existia (decisão explícita do usuário).
//
// Saldo de cada cofre é sempre CALCULADO (soma de entradas − saídas em transferencias_tesouraria)
// — não existe campo de saldo gravado em lugar nenhum, mesmo espírito de nunca confiar num campo
// espelho já documentado em useFechamentos.ts.
import { computed, onMounted, ref } from 'vue';
import { CAIXAS, hojeISO } from '~/types/fechamento';
import {
  useTransferenciasTesouraria,
  COFRES_CENTRAIS,
  type CaixaOuCofre,
  type CofreCentral,
  type TransferenciaTesouraria,
} from '~/composables/useTransferenciasTesouraria';
import { useCofreNotas, type CofreNota } from '~/composables/useCofreNotas';
import { useCofreSaldoInicial, type CofreSaldoInicial } from '~/composables/useCofreSaldoInicial';
import {
  FLUXO_CONTAS,
  useFluxoLancamentos,
  type FluxoConta,
  type FluxoLancamento,
} from '~/composables/useFluxoLancamentos';
import CampoDinheiro from '~/components/comum/CampoDinheiro.vue';
import { formatCents } from '~/utils/financeiro';
import { formatarDataBr } from '~/utils/vendasFechamento';
import { mensagemDeErro } from '~/utils/erros';
import AppCabecalhoTela from '~/components/app/AppCabecalhoTela.vue';
import { useSupabase } from '~/composables/useSupabase';
import ConfirmacaoDialog from '~/components/comum/ConfirmacaoDialog.vue';

definePageMeta({ middleware: ['admin'] });

const ICONE_COFRE: Record<CofreCentral, string> = {
  'Caixa Principal': 'mdi-safe-square-outline',
  'Caixa de Troco': 'mdi-cash-multiple',
  Fluxo: 'mdi-swap-horizontal-bold',
};
const DESCRICAO_COFRE: Record<CofreCentral, string> = {
  'Caixa Principal':
    'Guarda o dinheiro principal da loja. Não faz pagamentos — só armazena e transfere pro Troco ou Financeiro.',
  'Caixa de Troco': 'Recebe do Principal e distribui/movimenta dinheiro pros outros caixas.',
  Fluxo:
    'Dinheiro circulando nos malotes/caixas. Depois da conferência, parte fica aqui e parte volta pro Principal.',
};
const NOME_COFRE: Record<CofreCentral, string> = {
  'Caixa Principal': 'Cofre Principal',
  'Caixa de Troco': 'Cofre Troco',
  Fluxo: 'Cofre Fluxo',
};

const {
  listar,
  confirmarRecebimento,
  criar,
  editar: editarTransferencia,
  excluir: excluirTransferencia,
} = useTransferenciasTesouraria();
const {
  listar: listarFluxo,
  criar: criarFluxo,
  editar: editarFluxo,
  excluir: excluirFluxo,
} = useFluxoLancamentos();
const { listar: listarNotas, adicionar: adicionarNota, remover: removerNota } = useCofreNotas();
const {
  listar: listarSaldosIniciais,
  definir: definirSaldoInicial,
  remover: removerSaldoInicial,
} = useCofreSaldoInicial();
const supabase = useSupabase();

const carregando = ref(true);
const erro = ref<string | null>(null);
const transferencias = ref<TransferenciaTesouraria[]>([]);
const fluxoLancamentos = ref<FluxoLancamento[]>([]);
interface EntradaTroco {
  id: string;
  valorCents: number;
  dataLanc: string;
  caixaDestino: string;
  responsavel: string;
}
const entradasTroco = ref<EntradaTroco[]>([]);
const saldosIniciais = ref<Record<CofreCentral, CofreSaldoInicial | null>>({
  'Caixa Principal': null,
  'Caixa de Troco': null,
  Fluxo: null,
});
function dataCorteDe(cofre: CofreCentral): string | null {
  return saldosIniciais.value[cofre]?.dataCorte ?? null;
}
function saldoInicialCentsDe(cofre: CofreCentral): number {
  return saldosIniciais.value[cofre]?.saldoCents ?? 0;
}
const fluxoBancoDisponivel = ref(true);
const confirmandoId = ref<string | null>(null);
// `carregando` controla o `v-if` que troca todo o conteúdo pelo spinner — ótimo na carga
// inicial, mas recarregar depois de registrar uma entrada/saída/confirmação com o MESMO `v-if`
// desmonta e remonta `v-expansion-panels` inteiro, perdendo qual painel estava aberto (achado
// real em teste: o painel do Caixa Principal fechava sozinho toda vez que o saldo atualizava).
// `mostrarSpinner: false` nas recargas depois da primeira mantém os painéis abertos.
async function carregar(mostrarSpinner = true): Promise<void> {
  if (mostrarSpinner) carregando.value = true;
  erro.value = null;
  try {
    transferencias.value = await listar();
    // Suprimento que os caixas registram em "Entrada" (origem sempre fixa em Caixa de Troco, ver
    // SecaoTransferencias.vue::novaEntrada) tem que sair automaticamente do saldo do Caixa de
    // Troco — bug real corrigido (01/10/2026, pedido do usuário): o filtro antigo (`tipo_conta =
    // 'COFRE'`) nunca batia com nenhuma linha de verdade (o campo fica 'DINHEIRO' ou vazio aqui),
    // então o saldo do Troco nunca descontava o que os caixas já tinham pego. O filtro certo é
    // `caixa_origem = 'Caixa de Troco'` — e pedido junto: "descrito o dia, quem pegou e os
    // valores", por isso o join com fechamentos (pra saber qual caixa/turno/responsável pegou).
    const { data: entradasCofre, error: erroEntradasCofre } = await supabase
      .from('entradas')
      .select('id, valor, caixa_destino, fechamentos(data, responsavel)')
      .eq('caixa_origem', 'Caixa de Troco');
    if (erroEntradasCofre) throw erroEntradasCofre;
    type LinhaEntradaTroco = {
      id: string;
      valor: string;
      caixa_destino: string;
      fechamentos: { data?: string; responsavel?: string } | null;
    };
    const linhas = (entradasCofre ?? []) as unknown as LinhaEntradaTroco[];
    entradasTroco.value = linhas.map((e) => ({
      id: e.id,
      valorCents: Math.round(Number(e.valor) * 100),
      dataLanc: e.fechamentos?.data ?? '',
      caixaDestino: e.caixa_destino,
      responsavel: e.fechamentos?.responsavel ?? '',
    }));
    const todosSaldosIniciais = await listarSaldosIniciais();
    for (const cofre of COFRES_CENTRAIS) {
      saldosIniciais.value[cofre] = todosSaldosIniciais.find((s) => s.cofre === cofre) ?? null;
    }
    fluxoBancoDisponivel.value = true;
    try {
      fluxoLancamentos.value = await listarFluxo();
    } catch (e) {
      if (ehTabelaFluxoAusente(e)) {
        fluxoLancamentos.value = [];
        fluxoBancoDisponivel.value = false;
      } else {
        throw e;
      }
    }
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível carregar os cofres.');
  } finally {
    if (mostrarSpinner) carregando.value = false;
  }
}

function ehTabelaFluxoAusente(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const erroSupabase = e as { code?: string; message?: string; details?: string };
  const texto = `${erroSupabase.message ?? ''} ${erroSupabase.details ?? ''}`.toLowerCase();
  return erroSupabase.code === '42P01' || texto.includes('fluxo_lancamentos');
}
onMounted(async () => {
  await carregar();
  // Só 3 cofres — carrega as anotações de todos de uma vez em vez de depender de detectar o
  // evento certo de expandir cada v-expansion-panel individualmente.
  await Promise.all(COFRES_CENTRAIS.map((cofre) => aoAbrirCofre(cofre)));
});

// Prefixo reconhecido no template pra esconder editar/excluir desses itens sintéticos — uma
// Entrada só se edita/exclui dentro do fechamento dela, nunca por aqui.
const PREFIXO_ENTRADA_TROCO = 'entrada-troco-';
function entradaTrocoParaMovimentacao(e: EntradaTroco): TransferenciaTesouraria {
  return {
    id: `${PREFIXO_ENTRADA_TROCO}${e.id}`,
    valorCents: e.valorCents,
    valorNotasCents: 0,
    valorMoedasCents: 0,
    lacre: '',
    lacreUsadoEm: null,
    dataLanc: e.dataLanc,
    agendamento: false,
    dataRecebimento: e.dataLanc,
    confirmadoEm: e.dataLanc,
    caixaOrigem: 'Caixa de Troco',
    caixaDestino: e.caixaDestino as CaixaOuCofre,
    turnoOrigem: null,
    turnoDestino: null,
    multiploDestino: false,
    destinosExtra: [],
    tempoConfirmacao: false,
    transferenciaRetorno: false,
    observacao: `Suprimento entregue${e.responsavel ? ' — ' + e.responsavel : ''}`,
    criadoEm: e.dataLanc,
  };
}
// "Zerar o histórico e recomeçar" (pedido do usuário, 01/10/2026): com `dataCorteDe(cofre)`
// definido, tanto o saldo quanto a lista de Movimentações ignoram tudo com data ANTERIOR ao
// corte — não apaga nada real, só para de contar/mostrar aqui. Sem corte definido (cofre nunca
// usou "Definir saldo inicial"), conta tudo, exatamente como sempre foi.
function depoisDoCorte(cofre: CofreCentral, data: string): boolean {
  const corte = dataCorteDe(cofre);
  return !corte || data >= corte;
}
function movimentacoesDe(cofre: CofreCentral): TransferenciaTesouraria[] {
  if (cofre === 'Fluxo') return movimentacoesDoFluxo();
  const base = transferencias.value.filter(
    (t) => (t.caixaOrigem === cofre || t.caixaDestino === cofre) && depoisDoCorte(cofre, t.dataLanc),
  );
  const itens =
    cofre === 'Caixa de Troco'
      ? [
          ...base,
          ...entradasTroco.value
            .filter((e) => depoisDoCorte(cofre, e.dataLanc))
            .map(entradaTrocoParaMovimentacao),
        ]
      : base;
  return itens.sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
}

// Bug real corrigido (01/10/2026, achado do usuário: "criei 4 lacres... deveria ter sido
// descontado no Cofre Fluxo e não foi"): isto só contava transferências automáticas de retorno/
// sangria (origem = um Caixa) como "movimento do Fluxo" — qualquer transferência manual com
// ORIGEM no próprio Fluxo (ex.: "Fluxo → Caixa 4", os lacres que o usuário criou na Tesouraria)
// ficava de fora da lista inteira, e por isso nunca era descontada do saldo. Fluxo agora usa o
// mesmo filtro genérico dos outros cofres (qualquer transferência onde ele é origem OU destino).
function movimentacoesDoFluxo(): TransferenciaTesouraria[] {
  return transferencias.value
    .filter(
      (t) =>
        (t.caixaOrigem === 'Fluxo' || t.caixaDestino === 'Fluxo') && depoisDoCorte('Fluxo', t.dataLanc),
    )
    .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
}
function saldoDe(cofre: CofreCentral): number {
  const inicialCents = saldoInicialCentsDe(cofre);
  const saldoTransferencias = transferencias.value
    .filter((t) => depoisDoCorte(cofre, t.dataLanc))
    .reduce((soma, t) => {
      if (t.caixaDestino === cofre) return soma + t.valorCents;
      if (t.caixaOrigem === cofre) return soma - t.valorCents;
      return soma;
    }, 0);
  if (cofre === 'Fluxo') {
    const lancamentosManuais = fluxoLancamentos.value
      .filter((l) => depoisDoCorte(cofre, l.data))
      .reduce((soma, l) => soma + l.valorCents, 0);
    return inicialCents + saldoTransferencias + lancamentosManuais;
  }
  if (cofre === 'Caixa de Troco') {
    const entradasCents = entradasTroco.value
      .filter((e) => depoisDoCorte(cofre, e.dataLanc))
      .reduce((soma, e) => soma + e.valorCents, 0);
    return inicialCents + saldoTransferencias - entradasCents;
  }
  return inicialCents + saldoTransferencias;
}

function nomeCofre(cofre: CofreCentral): string {
  return NOME_COFRE[cofre];
}
function pendentesDe(cofre: CofreCentral): TransferenciaTesouraria[] {
  return transferencias.value.filter((t) => t.caixaDestino === cofre && !t.dataRecebimento);
}

async function confirmar(t: TransferenciaTesouraria): Promise<void> {
  confirmandoId.value = t.id;
  try {
    await confirmarRecebimento(t.id);
    await carregar(false);
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível confirmar o recebimento.');
  } finally {
    confirmandoId.value = null;
  }
}

// Anotações — carregadas só quando o painel do cofre abre pela primeira vez (mesmo padrão de
// carregamento sob demanda de useVendasProdutoDia em SecaoRelatorioFinal.vue).
const notasPorCofre = ref<Record<CofreCentral, CofreNota[]>>({
  'Caixa Principal': [],
  'Caixa de Troco': [],
  Fluxo: [],
});
const notasCarregadas = ref<Record<CofreCentral, boolean>>({
  'Caixa Principal': false,
  'Caixa de Troco': false,
  Fluxo: false,
});
const novaNotaTexto = ref<Record<CofreCentral, string>>({
  'Caixa Principal': '',
  'Caixa de Troco': '',
  Fluxo: '',
});
const salvandoNota = ref<CofreCentral | null>(null);

async function aoAbrirCofre(cofre: CofreCentral): Promise<void> {
  if (notasCarregadas.value[cofre]) return;
  notasCarregadas.value[cofre] = true;
  try {
    notasPorCofre.value[cofre] = await listarNotas(cofre);
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível carregar as anotações.');
  }
}
async function salvarNota(cofre: CofreCentral): Promise<void> {
  const texto = novaNotaTexto.value[cofre].trim();
  if (!texto) return;
  salvandoNota.value = cofre;
  try {
    await adicionarNota(cofre, texto);
    novaNotaTexto.value[cofre] = '';
    notasPorCofre.value[cofre] = await listarNotas(cofre);
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível salvar a anotação.');
  } finally {
    salvandoNota.value = null;
  }
}
async function excluirNota(cofre: CofreCentral, id: string): Promise<void> {
  try {
    await removerNota(id);
    notasPorCofre.value[cofre] = notasPorCofre.value[cofre].filter((n) => n.id !== id);
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível excluir a anotação.');
  }
}

// "Definir saldo inicial" (pedido do usuário, 01/10/2026): formulário Data + Valor por cofre,
// mesmo padrão visual de "Registrar caixa do dia" do Caixa Principal logo abaixo.
const saldoInicialAberto = ref<Record<CofreCentral, boolean>>({
  'Caixa Principal': false,
  'Caixa de Troco': false,
  Fluxo: false,
});
const saldoInicialDataForm = ref<Record<CofreCentral, string>>({
  'Caixa Principal': hojeISO(),
  'Caixa de Troco': hojeISO(),
  Fluxo: hojeISO(),
});
const saldoInicialValorForm = ref<Record<CofreCentral, number>>({
  'Caixa Principal': 0,
  'Caixa de Troco': 0,
  Fluxo: 0,
});
const salvandoSaldoInicial = ref<CofreCentral | null>(null);

function abrirFormSaldoInicial(cofre: CofreCentral): void {
  const atual = saldosIniciais.value[cofre];
  saldoInicialDataForm.value[cofre] = atual?.dataCorte ?? hojeISO();
  saldoInicialValorForm.value[cofre] = atual?.saldoCents ?? 0;
  saldoInicialAberto.value[cofre] = !saldoInicialAberto.value[cofre];
}
async function salvarSaldoInicial(cofre: CofreCentral): Promise<void> {
  salvandoSaldoInicial.value = cofre;
  try {
    const dataCorte = saldoInicialDataForm.value[cofre];
    const saldoCents = saldoInicialValorForm.value[cofre];
    await definirSaldoInicial(cofre, saldoCents, dataCorte);
    saldosIniciais.value[cofre] = {
      cofre,
      saldoCents,
      dataCorte,
      atualizadoEm: new Date().toISOString(),
    };
    saldoInicialAberto.value[cofre] = false;
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível definir o saldo inicial.');
  } finally {
    salvandoSaldoInicial.value = null;
  }
}
async function removerCorteDe(cofre: CofreCentral): Promise<void> {
  salvandoSaldoInicial.value = cofre;
  try {
    await removerSaldoInicial(cofre);
    saldosIniciais.value[cofre] = null;
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível remover o saldo inicial.');
  } finally {
    salvandoSaldoInicial.value = null;
  }
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
function formatarDataCurta(iso: string): string {
  return iso ? formatarDataBr(iso).slice(0, 5) : '';
}

// Lançamentos rápidos do Caixa Principal (pedido do usuário, 23/09/2026) — dois atalhos que criam
// uma transferência de verdade (mesma tabela `transferencias_tesouraria` de sempre) sem passar
// pelo modal completo "Nova Transferência", com uma frase de confirmação formada em tempo real:
//   Entrada: "22/09 + 5.250 caixa do dia 21/09" — valor que o admin está DECLARANDO que já está
//   fisicamente no Principal (ex.: contagem do dia), não dinheiro saindo de outro cofre rastreado
//   aqui — por isso origem = 'Cofre' (o genérico antigo, fora do cálculo dos 3 cofres centrais;
//   correção real, 01/10/2026: usava 'Fluxo' antes, descontando sem motivo um cofre que nunca
//   perdeu esse dinheiro).
//   Saída: "23/09 - 2.000 para caixa troco" — destino sempre fixo em Caixa de Troco (decisão
//   explícita do usuário: sem seletor de destino aqui, só Data + Valor).
const entradaData = ref(hojeISO());
const entradaValorCents = ref(0);
const entradaDataReferencia = ref('');
const salvandoEntrada = ref(false);

const fraseEntrada = computed(() => {
  if (!entradaData.value || !entradaValorCents.value || !entradaDataReferencia.value) return '';
  return `${formatarDataCurta(entradaData.value)} + ${formatCents(entradaValorCents.value)} caixa do dia ${formatarDataCurta(entradaDataReferencia.value)}`;
});

async function registrarEntradaPrincipal(): Promise<void> {
  if (!fraseEntrada.value) return;
  salvandoEntrada.value = true;
  try {
    await criar({
      valorCents: entradaValorCents.value,
      valorNotasCents: 0,
      valorMoedasCents: 0,
      lacre: `PRINCIPAL-ENT-${Date.now()}`,
      agendamento: false,
      caixaOrigem: 'Cofre',
      caixaDestino: 'Caixa Principal',
      multiploDestino: false,
      destinosExtra: [],
      tempoConfirmacao: false,
      transferenciaRetorno: false,
      observacao: `Caixa do dia ${formatarDataBr(entradaDataReferencia.value)}`,
      dataLanc: entradaData.value,
    });
    entradaValorCents.value = 0;
    entradaDataReferencia.value = '';
    entradaData.value = hojeISO();
    await carregar(false);
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível registrar a entrada.');
  } finally {
    salvandoEntrada.value = false;
  }
}

const saidaAberta = ref(false);
const saidaData = ref(hojeISO());
const saidaValorCents = ref(0);
const salvandoSaida = ref(false);

const fraseSaida = computed(() => {
  if (!saidaData.value || !saidaValorCents.value) return '';
  return `${formatarDataCurta(saidaData.value)} - ${formatCents(saidaValorCents.value)} para caixa troco`;
});

async function registrarSaidaParaTroco(): Promise<void> {
  if (!fraseSaida.value) return;
  salvandoSaida.value = true;
  try {
    await criar({
      valorCents: saidaValorCents.value,
      valorNotasCents: 0,
      valorMoedasCents: 0,
      lacre: `PRINCIPAL-SAI-${Date.now()}`,
      agendamento: false,
      caixaOrigem: 'Caixa Principal',
      caixaDestino: 'Caixa de Troco',
      multiploDestino: false,
      destinosExtra: [],
      tempoConfirmacao: false,
      transferenciaRetorno: false,
      observacao: 'Saída do Principal pro Troco',
      dataLanc: saidaData.value,
    });
    saidaValorCents.value = 0;
    saidaData.value = hojeISO();
    saidaAberta.value = false;
    await carregar(false);
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível registrar a saída.');
  } finally {
    salvandoSaida.value = false;
  }
}

const fluxoData = ref(hojeISO());
const fluxoValorCents = ref(0);
const fluxoConta = ref<FluxoConta>('Conta Cofre');
const salvandoFluxo = ref(false);

async function registrarLancamentoFluxo(): Promise<void> {
  if (!fluxoData.value || fluxoValorCents.value <= 0) return;
  salvandoFluxo.value = true;
  try {
    await criarFluxo({ data: fluxoData.value, valorCents: fluxoValorCents.value, conta: fluxoConta.value });
    fluxoData.value = hojeISO();
    fluxoValorCents.value = 0;
    fluxoConta.value = 'Conta Cofre';
    await carregar(false);
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível registrar o lançamento do Fluxo.');
  } finally {
    salvandoFluxo.value = false;
  }
}
const OPCOES_COFRE_EDIT: CaixaOuCofre[] = ['Cofre', 'Caixa Principal', 'Caixa de Troco', 'Fluxo', ...CAIXAS];
function rotuloCofreEdit(valor: CaixaOuCofre): string {
  if (valor === 'Caixa Principal') return 'Cofre Principal';
  if (valor === 'Caixa de Troco') return 'Cofre Troco';
  if (valor === 'Fluxo') return 'Cofre Fluxo';
  return valor;
}
const editorAberto = ref(false);
const editorTipo = ref<'fluxo' | 'transferencia'>('fluxo');
const editorId = ref('');
const editorData = ref(hojeISO());
const editorValorCents = ref(0);
const editorConta = ref<FluxoConta>('Conta Cofre');
const editorLacre = ref('');
const editorOrigem = ref<CaixaOuCofre>('Cofre');
const editorDestino = ref<CaixaOuCofre>('Fluxo');
const editorObservacao = ref('');
const salvandoEdicao = ref(false);
const exclusaoAberta = ref(false);
const exclusaoTipo = ref<'fluxo' | 'transferencia'>('fluxo');
const exclusaoId = ref<string | null>(null);
const excluindo = ref(false);

function abrirEdicaoFluxo(lancamento: FluxoLancamento): void {
  editorTipo.value = 'fluxo';
  editorId.value = lancamento.id;
  editorData.value = lancamento.data;
  editorValorCents.value = lancamento.valorCents;
  editorConta.value = lancamento.conta;
  editorAberto.value = true;
}

function abrirEdicaoTransferencia(transferencia: TransferenciaTesouraria): void {
  editorTipo.value = 'transferencia';
  editorId.value = transferencia.id;
  editorData.value = transferencia.dataLanc;
  editorValorCents.value = transferencia.valorCents;
  editorLacre.value = transferencia.lacre;
  editorOrigem.value = transferencia.caixaOrigem;
  editorDestino.value = transferencia.caixaDestino;
  editorObservacao.value = transferencia.observacao;
  editorAberto.value = true;
}

async function salvarEdicaoCofre(): Promise<void> {
  if (!editorId.value || !editorData.value || editorValorCents.value <= 0) return;
  salvandoEdicao.value = true;
  try {
    if (editorTipo.value === 'fluxo') {
      await editarFluxo(editorId.value, {
        data: editorData.value,
        valorCents: editorValorCents.value,
        conta: editorConta.value,
      });
    } else {
      await editarTransferencia(editorId.value, {
        valorCents: editorValorCents.value,
        lacre: editorLacre.value,
        dataLanc: editorData.value,
        caixaOrigem: editorOrigem.value,
        caixaDestino: editorDestino.value,
        observacao: editorObservacao.value,
      });
    }
    editorAberto.value = false;
    await carregar(false);
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível editar o lançamento.');
  } finally {
    salvandoEdicao.value = false;
  }
}

function pedirExclusaoFluxo(id: string): void {
  exclusaoTipo.value = 'fluxo';
  exclusaoId.value = id;
  exclusaoAberta.value = true;
}

function pedirExclusaoTransferencia(id: string): void {
  exclusaoTipo.value = 'transferencia';
  exclusaoId.value = id;
  exclusaoAberta.value = true;
}

async function confirmarExclusaoCofre(): Promise<void> {
  if (!exclusaoId.value) return;
  excluindo.value = true;
  try {
    if (exclusaoTipo.value === 'fluxo') await excluirFluxo(exclusaoId.value);
    else await excluirTransferencia(exclusaoId.value);
    exclusaoAberta.value = false;
    exclusaoId.value = null;
    await carregar(false);
  } catch (e) {
    erro.value = mensagemDeErro(e, 'Não foi possível excluir a movimentação.');
  } finally {
    excluindo.value = false;
  }
}
</script>

<template>
  <v-container class="py-6" style="max-width: 900px">
    <AppCabecalhoTela titulo="Cofres" />
    <p class="text-body-2 text-medium-emphasis mb-5">
      Cofre Principal → Cofre Troco → Caixas/Cofre Fluxo → Conferência → parte volta pro Principal, o
      resto fica no Cofre Fluxo. Clique num cofre pra ver saldo, pendências, histórico e anotar.
    </p>

    <v-alert v-if="erro" type="error" variant="tonal" class="mb-4">{{ erro }}</v-alert>

    <div v-if="carregando" class="d-flex justify-center py-10">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <v-expansion-panels v-else variant="accordion" class="cat-accordion">
      <v-expansion-panel
        v-for="cofre in COFRES_CENTRAIS"
        :key="cofre"
        class="cat-painel"
        :style="{ '--cat': 'var(--cx-brand)', '--cat-soft': 'var(--cx-brand-wash)', '--cat-tinta': 'var(--cx-brand-text)' }"
      >
        <v-expansion-panel-title class="cat-titulo">
          <v-icon size="18" class="mr-2">{{ ICONE_COFRE[cofre] }}</v-icon>
          <span class="flex-grow-1 cat-titulo-rotulo">{{ nomeCofre(cofre) }}</span>
          <strong class="cat-valor">R$ {{ formatCents(saldoDe(cofre)) }}</strong>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <p class="text-caption text-medium-emphasis">{{ DESCRICAO_COFRE[cofre] }}</p>

          <!-- Saldo inicial / corte de histórico (pedido do usuário, 01/10/2026) -->
          <div class="mb-4">
            <div
              v-if="saldosIniciais[cofre]"
              class="text-caption text-medium-emphasis d-flex align-center ga-2 flex-wrap"
            >
              <span>
                Contando a partir de {{ formatarDataBr(saldosIniciais[cofre]!.dataCorte) }},
                começando em R$ {{ formatCents(saldosIniciais[cofre]!.saldoCents) }} — o histórico
                anterior continua salvo, só não entra mais nessa conta.
              </span>
              <v-btn size="x-small" variant="text" @click="abrirFormSaldoInicial(cofre)">
                Editar
              </v-btn>
              <v-btn
                size="x-small"
                variant="text"
                color="error"
                :loading="salvandoSaldoInicial === cofre"
                @click="removerCorteDe(cofre)"
              >
                Remover corte
              </v-btn>
            </div>
            <v-btn
              v-else
              size="small"
              variant="text"
              prepend-icon="mdi-restart"
              @click="abrirFormSaldoInicial(cofre)"
            >
              Definir saldo inicial
            </v-btn>

            <div v-if="saldoInicialAberto[cofre]" class="d-flex flex-wrap ga-2 align-end mt-2">
              <v-text-field
                v-model="saldoInicialDataForm[cofre]"
                type="date"
                label="A partir de"
                density="compact"
                hide-details
                style="max-width: 160px"
              />
              <CampoDinheiro v-model="saldoInicialValorForm[cofre]" label="Saldo inicial" />
              <v-btn
                size="small"
                color="primary"
                variant="tonal"
                :loading="salvandoSaldoInicial === cofre"
                @click="salvarSaldoInicial(cofre)"
              >
                Salvar
              </v-btn>
              <v-btn size="small" variant="text" @click="saldoInicialAberto[cofre] = false">
                Cancelar
              </v-btn>
            </div>
          </div>

          <!-- Lançamentos rápidos — só no Caixa Principal (pedido do usuário, 23/09/2026) -->
          <div v-if="cofre === 'Caixa Principal'" class="lancamento-rapido mb-4">
            <p class="text-caption font-weight-bold mb-2">Registrar caixa do dia</p>
            <div class="d-flex flex-wrap ga-2 align-end">
              <v-text-field
                v-model="entradaData"
                type="date"
                label="Data"
                density="compact"
                hide-details
                style="max-width: 160px"
              />
              <CampoDinheiro v-model="entradaValorCents" label="Valor" />
              <v-text-field
                v-model="entradaDataReferencia"
                type="date"
                label="Caixa do dia"
                density="compact"
                hide-details
                style="max-width: 160px"
              />
              <v-btn
                size="small"
                color="primary"
                variant="tonal"
                :loading="salvandoEntrada"
                :disabled="!fraseEntrada"
                @click="registrarEntradaPrincipal"
              >
                Registrar
              </v-btn>
            </div>
            <p v-if="fraseEntrada" class="text-caption text-success mt-1 mb-0">{{ fraseEntrada }}</p>

            <v-btn
              size="small"
              variant="text"
              class="mt-3"
              :append-icon="saidaAberta ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              @click="saidaAberta = !saidaAberta"
            >
              Saídas para cofre
            </v-btn>
            <div v-if="saidaAberta" class="mt-2">
              <div class="d-flex flex-wrap ga-2 align-end">
                <v-text-field
                  v-model="saidaData"
                  type="date"
                  label="Data"
                  density="compact"
                  hide-details
                  style="max-width: 160px"
                />
                <CampoDinheiro v-model="saidaValorCents" label="Valor" />
                <v-btn
                  size="small"
                  color="primary"
                  variant="tonal"
                  :loading="salvandoSaida"
                  :disabled="!fraseSaida"
                  @click="registrarSaidaParaTroco"
                >
                  Registrar
                </v-btn>
              </div>
              <p v-if="fraseSaida" class="text-caption text-error mt-1 mb-0">{{ fraseSaida }}</p>
            </div>
          </div>

          <!-- O valor do troco é informado aqui apenas como saldo inicial. A transferência para
               cada caixa é registrada no formulário do próprio caixa. -->
          <div v-if="cofre === 'Caixa de Troco'" class="lancamento-rapido mb-4">
            <p class="text-caption font-weight-bold mb-2">Informar quanto tem no Caixa de Troco</p>
            <div class="d-flex flex-wrap ga-2 align-end">
              <CampoDinheiro v-model="saldoInicialValorForm['Caixa de Troco']" label="Valor no troco" />
              <v-btn
                size="small"
                color="primary"
                variant="tonal"
                :loading="salvandoSaldoInicial === 'Caixa de Troco'"
                @click="salvarSaldoInicial('Caixa de Troco')"
              >
                Salvar valor
              </v-btn>
            </div>
          </div>

          <div v-if="cofre === 'Fluxo'" class="lancamento-rapido mb-4">
            <p class="text-caption font-weight-bold mb-2">Registrar no Fluxo</p>
            <v-alert v-if="!fluxoBancoDisponivel" type="warning" variant="tonal" density="compact" class="mb-3">
              O banco ainda precisa receber a atualização dos lançamentos do Fluxo.
            </v-alert>
            <div class="d-flex flex-wrap ga-2 align-end">
              <v-text-field
                v-model="fluxoData"
                type="date"
                label="Data"
                density="compact"
                hide-details
                :disabled="!fluxoBancoDisponivel"
                style="max-width: 160px"
              />
              <CampoDinheiro v-model="fluxoValorCents" label="Valor" :readonly="!fluxoBancoDisponivel" />
              <v-select
                v-model="fluxoConta"
                :items="FLUXO_CONTAS"
                label="Conta"
                density="compact"
                hide-details
                :disabled="!fluxoBancoDisponivel"
                style="max-width: 190px"
              />
              <v-btn
                size="small"
                color="primary"
                variant="tonal"
                :loading="salvandoFluxo"
                :disabled="!fluxoBancoDisponivel || !fluxoData || fluxoValorCents <= 0"
                @click="registrarLancamentoFluxo"
              >
                Registrar
              </v-btn>
            </div>
          </div>

          <!-- Pendentes de confirmação -->
          <div v-if="pendentesDe(cofre).length" class="mb-4">
            <p class="text-caption font-weight-bold mb-2">Aguardando confirmação de recebimento</p>
            <div class="d-flex flex-column ga-2">
              <div
                v-for="t in pendentesDe(cofre)"
                :key="t.id"
                class="d-flex align-center flex-wrap ga-2 pa-2 pendencia-item"
              >
                <span class="text-caption">{{ t.caixaOrigem }} → {{ cofre }}</span>
                <span class="text-caption text-medium-emphasis">Lacre {{ t.lacre }}</span>
                <span class="text-caption text-medium-emphasis">{{ formatarDataBr(t.dataLanc) }}</span>
                <strong class="text-caption">R$ {{ formatCents(t.valorCents) }}</strong>
                <v-spacer />
                <v-btn
                  size="x-small"
                  variant="tonal"
                  color="success"
                  :loading="confirmandoId === t.id"
                  @click="confirmar(t)"
                >
                  Confirmar
                </v-btn>
              </div>
            </div>
          </div>

          <!-- Anotações -->
          <p class="text-caption font-weight-bold mb-2">Anotações</p>
          <div class="d-flex ga-2 mb-3">
            <v-text-field
              v-model="novaNotaTexto[cofre]"
              density="compact"
              placeholder="Ex.: Contei e bate certinho hoje"
              hide-details
              @keyup.enter="salvarNota(cofre)"
            />
            <v-btn
              size="small"
              variant="tonal"
              color="primary"
              :loading="salvandoNota === cofre"
              :disabled="!novaNotaTexto[cofre].trim()"
              @click="salvarNota(cofre)"
            >
              Anotar
            </v-btn>
          </div>
          <div v-if="notasPorCofre[cofre].length" class="d-flex flex-column ga-2 mb-4">
            <div
              v-for="nota in notasPorCofre[cofre]"
              :key="nota.id"
              class="d-flex align-start ga-2 pa-2 nota-item"
            >
              <div class="flex-grow-1">
                <p class="text-body-2 mb-0">{{ nota.texto }}</p>
                <span class="text-caption text-medium-emphasis"
                  >{{ nota.criadoPorNome }} · {{ formatarDataHora(nota.criadoEm) }}</span
                >
              </div>
              <v-icon size="16" class="excluir-nota" @click="excluirNota(cofre, nota.id)"
                >mdi-close</v-icon
              >
            </div>
          </div>
          <p v-else class="text-caption text-medium-emphasis mb-4">Nenhuma anotação ainda.</p>

          <!-- Histórico -->
          <p class="text-caption font-weight-bold mb-2">Movimentações</p>
          <div
            v-if="movimentacoesDe(cofre).length || (cofre === 'Fluxo' && fluxoLancamentos.length)"
            class="d-flex flex-column ga-2"
          >
            <div
              v-for="t in movimentacoesDe(cofre)"
              :key="t.id"
              class="d-flex align-center flex-wrap ga-2 pa-2 movimentacao-item"
            >
              <v-icon size="16" :color="t.caixaDestino === cofre ? 'success' : 'error'">
                {{ t.caixaDestino === cofre ? 'mdi-arrow-bottom-left' : 'mdi-arrow-top-right' }}
              </v-icon>
              <span class="text-caption">
                {{ t.caixaDestino === cofre ? t.caixaOrigem : t.caixaDestino }}
              </span>
              <span v-if="t.observacao" class="text-caption text-medium-emphasis">{{ t.observacao }}</span>
              <span v-else class="text-caption text-medium-emphasis">Lacre {{ t.lacre }}</span>
              <span class="text-caption text-medium-emphasis">{{ formatarDataBr(t.dataLanc) }}</span>
              <v-spacer />
              <strong class="text-caption">R$ {{ formatCents(t.valorCents) }}</strong>
              <template v-if="!t.id.startsWith('entrada-troco-')">
                <v-btn
                  icon="mdi-delete-outline"
                  size="x-small"
                  variant="text"
                  color="error"
                  aria-label="Excluir movimentação"
                  @click="pedirExclusaoTransferencia(t.id)"
                />
                <v-btn
                  icon="mdi-pencil-outline"
                  size="x-small"
                  variant="text"
                  aria-label="Editar movimentação"
                  @click="abrirEdicaoTransferencia(t)"
                />
              </template>
              <span v-else class="text-caption text-medium-emphasis font-italic"
                >vem do fechamento</span
              >
            </div>
            <template v-if="cofre === 'Fluxo'">
              <div
                v-for="l in fluxoLancamentos"
                :key="l.id"
                class="d-flex align-center flex-wrap ga-2 pa-2 movimentacao-item"
              >
                <v-icon size="16" color="success">mdi-arrow-bottom-left</v-icon>
                <span class="text-caption">{{ l.conta }}</span>
                <span class="text-caption text-medium-emphasis">Lançamento manual</span>
                <span class="text-caption text-medium-emphasis">{{ formatarDataBr(l.data) }}</span>
                <v-spacer />
                <strong class="text-caption">R$ {{ formatCents(l.valorCents) }}</strong>
                <v-btn
                  icon="mdi-delete-outline"
                  size="x-small"
                  variant="text"
                  color="error"
                  aria-label="Excluir lançamento"
                  @click="pedirExclusaoFluxo(l.id)"
                />
                <v-btn
                  icon="mdi-pencil-outline"
                  size="x-small"
                  variant="text"
                  aria-label="Editar lançamento"
                  @click="abrirEdicaoFluxo(l)"
                />
              </div>
            </template>
          </div>
          <p v-else class="text-caption text-medium-emphasis mb-0">Nenhuma movimentação ainda.</p>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <v-dialog v-model="editorAberto" max-width="620">
      <v-card>
        <v-card-title>Editar lançamento do cofre</v-card-title>
        <v-card-text class="d-flex flex-column ga-3">
          <div class="d-flex flex-wrap ga-3">
            <v-text-field v-model="editorData" type="date" label="Data" />
            <CampoDinheiro v-model="editorValorCents" label="Valor" />
          </div>
          <v-select
            v-if="editorTipo === 'fluxo'"
            v-model="editorConta"
            :items="FLUXO_CONTAS"
            label="Conta"
          />
          <template v-else>
            <v-text-field v-model="editorLacre" label="Lacre" />
            <div class="d-flex flex-wrap ga-3">
              <v-select
                v-model="editorOrigem"
                :items="OPCOES_COFRE_EDIT"
                :item-title="rotuloCofreEdit"
                label="Origem"
              />
              <v-select
                v-model="editorDestino"
                :items="OPCOES_COFRE_EDIT"
                :item-title="rotuloCofreEdit"
                label="Destino"
              />
            </div>
            <v-textarea v-model="editorObservacao" label="Observação" rows="2" />
          </template>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="editorAberto = false">Cancelar</v-btn>
          <v-btn
            color="primary"
            :loading="salvandoEdicao"
            :disabled="!editorData || editorValorCents <= 0"
            @click="salvarEdicaoCofre"
          >
            Salvar alterações
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <ConfirmacaoDialog
      :model-value="exclusaoAberta"
      titulo="Excluir movimentação do cofre?"
      mensagem="Esta movimentação será removida e o saldo será recalculado. Esta ação não pode ser desfeita."
      texto-confirmar="Excluir"
      @update:model-value="exclusaoAberta = false"
      @confirmar="confirmarExclusaoCofre"
    />
  </v-container>
</template>

<style scoped>
.lancamento-rapido {
  padding: var(--cx-sp-3);
  border: 1px dashed var(--cx-line);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface-sunken);
}
.pendencia-item {
  border-radius: var(--cx-r-md);
  background: var(--cx-warning-wash, var(--cx-surface-sunken));
}
.nota-item,
.movimentacao-item {
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}
.excluir-nota {
  cursor: pointer;
  opacity: 0.5;
}
.excluir-nota:hover {
  opacity: 1;
}
</style>
