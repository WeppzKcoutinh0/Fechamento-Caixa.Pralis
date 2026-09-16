import { criarFechamentoVazio, type FechamentoDraft } from '~/types/fechamento';

const TOTAL_SECOES = 5;

const draftState = () =>
  useState<FechamentoDraft>('fechamento-draft', () => criarFechamentoVazio());
const secaoState = () => useState<number>('fechamento-secao-atual', () => 1);

/**
 * Estado e navegação do wizard — mesma mecânica de `navegarSecao()` atual: barra de progresso =
 * (seção-1)/(total-1), "Seção N de X", voltar oculto na 1, avançar oculto e salvar visível só na
 * última. Sem validação bloqueando avanço (o atual também não tem).
 *
 * Eram 6 seções; a Discriminação (antiga seção 5) passou a viver DENTRO do modal de cada
 * lançamento (mesma ideia do Pralís — discriminação é detalhe do lançamento, não uma etapa
 * própria), então a etapa separada foi removida para não deixar dois caminhos editando a mesma
 * lista (`draft.discriminacoes`). Nenhum campo/dado mudou, só onde se edita.
 */
export function useFechamentoForm() {
  const draft = draftState();
  const secaoAtual = secaoState();

  const progressoPct = computed(() => ((secaoAtual.value - 1) / (TOTAL_SECOES - 1)) * 100);
  const progressoLabel = computed(() => `Seção ${secaoAtual.value} de ${TOTAL_SECOES}`);
  const mostrarVoltar = computed(() => secaoAtual.value > 1);
  const mostrarAvancar = computed(() => secaoAtual.value < TOTAL_SECOES);
  const mostrarSalvar = computed(() => secaoAtual.value === TOTAL_SECOES);

  function irPara(secao: number): void {
    if (secao < 1 || secao > TOTAL_SECOES) return;
    secaoAtual.value = secao;
  }

  function avancar(): void {
    irPara(secaoAtual.value + 1);
  }

  function voltar(): void {
    irPara(secaoAtual.value - 1);
  }

  function novoFechamento(): void {
    draft.value = criarFechamentoVazio();
    secaoAtual.value = 1;
  }

  function carregarFechamento(existente: FechamentoDraft): void {
    draft.value = existente;
    secaoAtual.value = 1;
  }

  return {
    draft,
    secaoAtual,
    totalSecoes: TOTAL_SECOES,
    progressoPct,
    progressoLabel,
    mostrarVoltar,
    mostrarAvancar,
    mostrarSalvar,
    irPara,
    avancar,
    voltar,
    novoFechamento,
    carregarFechamento,
  };
}
