/**
 * Estado do formulário de fechamento (rascunho no client, antes de salvar). Espelha 1:1 os
 * campos de `docs/CONTRATO-COMPORTAMENTO-ATUAL.md` — nenhum campo daqui é novo. Valores
 * monetários ficam em centavos inteiros (ver `utils/financeiro.ts`), convertidos para decimal
 * só na hora de chamar `salvar_fechamento`.
 */

// Caixa 5 (pedido do usuário, 24/09/2026) — operado pelo gerente no turno da manhã, e como um
// caixa normal no turno da tarde. Mesmo tratamento dos outros 4 em todo o resto do app.
export const CAIXAS = ['Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4', 'Caixa 5'] as const;
export type Caixa = (typeof CAIXAS)[number];

export const TURNOS = ['Manhã', 'Tarde'] as const;
export type Turno = (typeof TURNOS)[number];

export const TIPOS_LANCAMENTO = ['despesa', 'mercadoria', 'retirada'] as const;
export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];

export const STATUS_LANCAMENTO = ['pago', 'naopago'] as const;
export type StatusLancamento = (typeof STATUS_LANCAMENTO)[number];

export const TIPOS_MER = ['computado', 'nao_computado'] as const;
export type TipoMer = (typeof TIPOS_MER)[number];

export const OBS_TIPOS = ['texto', 'audio'] as const;
export type ObsTipo = (typeof OBS_TIPOS)[number];

// Extensão pós-contrato (inspirada no Sistema Inteligente Pralís, mesma ideia de "categoria do
// credor" do lançamento — sem o cadastro de fornecedores/colaboradores dele, que não existe
// aqui): categoriza o texto livre já existente em "fornecedor", não troca de fonte de dado.
export const TIPOS_CREDOR = ['fornecedor', 'colaborador'] as const;
export type TipoCredor = (typeof TIPOS_CREDOR)[number];

export const GRUPOS_DISCRIMINACAO = [
  'paes',
  'bolos',
  'salgados',
  'doces',
  'bebidas',
  'laticinios',
  'frios',
  'materia_prima',
  'embalagens',
  'limpeza',
  'utensilios',
  'funcionarios',
  'servicos',
  'outros',
] as const;
export type GrupoDiscriminacao = (typeof GRUPOS_DISCRIMINACAO)[number];

export const TIPOS_CREDIARIO = ['cliente', 'colaborador'] as const;
export type TipoCrediario = (typeof TIPOS_CREDIARIO)[number];

// "Tipo de conta" da Entrada (pedido do usuário, 21/09/2026) — classifica de onde veio o
// dinheiro: forma de pagamento ou motivo de ajuste do CREARE. Opcional.
export const TIPOS_CONTA_ENTRADA = [
  'CREDITO',
  'DEBITO',
  'PIX',
  'VOUCHER',
  'DINHEIRO',
  'COLABORADOR',
  'SOBRA/PERDA',
  'FURTO/ROUBO',
  'LANCHES',
  'COFRE',
] as const;
export type TipoContaEntrada = (typeof TIPOS_CONTA_ENTRADA)[number];

export interface EntradaDraft {
  lacre: string;
  valorCents: number;
  descricao: string;
  tipoConta: TipoContaEntrada | '';
}

export interface SangriaDraft {
  descricao: string;
  lacre: string;
  valorCents: number;
}

export interface DetalheMaquininhaDraft {
  nome: string;
  valorCents: number;
}

export interface DetalhesMaquininhaDraft {
  credito: DetalheMaquininhaDraft[];
  debito: DetalheMaquininhaDraft[];
  pix: DetalheMaquininhaDraft[];
  voucher: DetalheMaquininhaDraft[];
}

export function criarDetalhesMaquininhaVazios(): DetalhesMaquininhaDraft {
  return { credito: [], debito: [], pix: [], voucher: [] };
}

/**
 * Registro de dinheiro movido entre dois caixas (ex.: Caixa 1 emprestou troco pro Caixa 2) —
 * versão simplificada, por decisão do usuário, da "Transferência" do Sistema Inteligente Pralís
 * (lá é um sistema de contas com múltiplos destinos candidatos e confirmação por outra pessoa;
 * aqui é só um registro dentro do próprio fechamento, sem cadastro de contas nem conferência).
 * Puramente informativo: não entra em `calculateRelatorioFinal` (ver utils/financeiro.ts) — como
 * não confirma o recebimento do outro lado, não há garantia de que o valor realmente chegou, então
 * tratá-lo como saída/entrada real inflaria ou reduziria a diferença sem essa certeza.
 */
export interface TransferenciaCaixaDraft {
  caixaOrigem: Caixa | '';
  caixaDestino: Caixa | '';
  valorCents: number;
  lacre: string;
  data: string;
  observacao: string;
}

export interface LancamentoDraft {
  // Gerado no client (crypto.randomUUID()) na criação e mantido como PK real na tabela
  // `lancamentos` — é o que permite ter N despesas/mercadorias/retiradas por fechamento
  // (a UI, antes desta extensão, só mostrava 1 lançamento por tipo) e ainda ligar cada item
  // discriminado (`DiscriminacaoDraft.lancamentoId`) ao lançamento certo, não só ao tipo.
  id: string;
  tipo: TipoLancamento;
  status: StatusLancamento;
  dataRef: string;
  dataNfe: string;
  nNfe: string;
  fornecedor: string;
  tipoMer: TipoMer | '';
  valorCents: number;
  // Juros/acréscimo — opcional, soma ao `valorCents` no "Valor Total" (ver financeiro.ts). Zero
  // por padrão: lançamento sem juros se comporta exatamente como antes desta extensão.
  valorAcrescimoCents: number;
  tipoCredor: TipoCredor;
  obsTipo: ObsTipo | '';
  obsTexto: string;
  obsAudioPath: string | null;
  fotoPath: string | null;
  vencimento: string;
  // Só tem sentido quando `status === 'pago'` — dia em que o pagamento realmente saiu.
  dataPagamento: string;
  fotoNotaPath: string | null;
  // '' = lançamento manual (comportamento de sempre). Uma das chaves de
  // `ResumoVendasDia.ajustes` (ver types/vendasFechamento.ts) quando este lançamento foi CRIADO
  // AUTOMATICAMENTE a partir do ajuste que o CREARE já manda (Colaboradores/Alimentação/
  // Furto-Roubo/Sócios/Sobra-Perda) — ver aplicarAjustesComoLancamentos em
  // utils/vendasFechamento.ts. Só serve pra achar/atualizar o MESMO lançamento numa nova busca
  // (idempotência, nunca duplica) sem impedir o usuário de editar/remover normalmente.
  origemAjusteCreare: string;
}

export interface DiscriminacaoDraft {
  // Liga este item ao `LancamentoDraft.id` específico — antes desta extensão a discriminação era
  // só filtrada por `tipo`, o que bastava porque só existia 1 lançamento por tipo. Com N
  // lançamentos por tipo, `tipo` sozinho não diz mais a qual despesa/mercadoria/retirada o item
  // pertence.
  lancamentoId: string;
  tipo: TipoLancamento;
  qtd: number;
  produto: string;
  grupo: GrupoDiscriminacao | '';
  valUnitCents: number;
  descontoValCents: number;
  descontoPct: number;
  // total NÃO é armazenado aqui — é sempre derivado via `calculateDiscrimination`
  // (mesmo raciocínio do totalPdv/ticketMedio: nada garante que um campo espelhado
  // fique sincronizado, então não existe um pra desincronizar).
}

export interface CrediarioItemDraft {
  tipo: TipoCrediario;
  nome: string;
  valorCents: number;
  fotoPath: string | null;
}

export interface MotivoVendaCanceladaDraft {
  tipo: 'texto' | 'audio';
  texto: string;
  audioPath: string | null;
}

/**
 * Um PDV do Relatório PDV — vira lista (pedido do usuário, 15/09/2026) porque um fechamento pode
 * ter mais de um caixa/máquina reportando vendas no mesmo dia. `id` gerado no client, mesmo
 * raciocínio de `LancamentoDraft.id`: é a PK real na tabela `pdv_entradas`, permite ligar cada
 * entrada de forma estável mesmo quando o usuário edita/reordena.
 */
export interface PdvEntradaDraft {
  id: string;
  nrClientes: number;
  dinheiroCents: number;
  creditoCents: number;
  debitoCents: number;
  pixCents: number;
  voucherCents: number;
  crediarioCents: number;
}

export interface FechamentoDraft {
  id: string;
  codigo: string;

  // Seção 1
  data: string;
  caixa: Caixa | '';
  turno: Turno | '';
  responsavel: string;

  // Seção 2
  entradas: EntradaDraft[];
  sangrias: SangriaDraft[];
  transferenciasCaixa: TransferenciaCaixaDraft[];

  // Seção 3
  lancamentos: LancamentoDraft[];

  // Seção 4 — PDV
  relatorioPdv: string;
  pdvEntradas: PdvEntradaDraft[];
  imgPdvPath: string | null;

  // Seção 4 — Maquininhas. É UMA máquina só, dividida entre manhã e tarde: quando a pessoa da
  // tarde assume, a máquina já vem com venda da manhã registrada (não zera por turno). Por isso o
  // relatório tirado de manhã vira o "saldo inicial" da tarde (manhaInicialCents guarda essa
  // leitura), e no fechamento da tarde o resultado real dela é o total lido na tarde (tardeFinalCents,
  // credito/debito/pix/voucherTardeCents) MENOS esse saldo inicial da manhã — ver
  // liqCreditoCents/liqDebitoCents/liqPixCents/liqVoucherCents em SecaoRelatorios.vue.
  nrMaquininha: string;
  nrMaquininhaTarde: string;
  manhaInicialCents: number;
  tardeFinalCents: number;
  creditoManhaCents: number;
  debitoManhaCents: number;
  pixManhaCents: number;
  voucherManhaCents: number;
  detalhesMaquininhaManha: DetalhesMaquininhaDraft;
  imgManhaPath: string | null;
  creditoTardeCents: number;
  debitoTardeCents: number;
  pixTardeCents: number;
  voucherTardeCents: number;
  detalhesMaquininhaTarde: DetalhesMaquininhaDraft;
  imgTardePath: string | null;

  // Seção 4 — Crediário
  crediario: CrediarioItemDraft[];

  // Seção 5
  discriminacoes: DiscriminacaoDraft[];

  // Seção 5 — Vendas/Produtos Cancelados (pedido do usuário, 23/09/2026, ligado de vez em
  // 24/09/2026: o robô de vendas passou a mandar itens cancelados, tipo='C' em
  // vendas_produto_dia — ver useVendasCanceladas.ts). Motivo (texto ou áudio) continua sendo
  // digitado/gravado manualmente pelo operador, independente do robô.
  vendasCanceladasMotivoTipo: 'texto' | 'audio';
  vendasCanceladasMotivoTexto: string;
  vendasCanceladasMotivoAudioPath: string | null;
  vendasCanceladasMotivos: Record<string, MotivoVendaCanceladaDraft>;

  // Seção 6 — card aditivo esperado × contado (decisão do plano). Notas/Moedas (pedido do
  // usuário, 23/09/2026): dinheiroContadoCents passa a ser SEMPRE a soma automática dos dois —
  // diferente do formulário da Tesouraria (admin), aqui o Valor Total é sempre calculado, nunca
  // digitado direto (ver SecaoRelatorioFinal.vue).
  dinheiroContadoCents: number;
  dinheiroContadoNotasCents: number;
  dinheiroContadoMoedasCents: number;
  // Lacre do malote que leva o dinheiro contado de volta ao cofre — sobe junto no retorno
  // automático pra Tesouraria (ver WizardFechamento.vue/useTransferenciasTesouraria.ts), pra
  // identificar esse malote específico na notificação do admin.
  lacreFechamento: string;
  // "Transferência Final" (pedido do usuário, 25/09/2026): Notas/Moedas/Lacre só podem ser
  // editados até o operador confirmar — depois disso ficam travados (readonly) e só então o
  // botão "Salvar" do wizard libera (ver SecaoRelatorioFinal.vue/WizardFechamento.vue). Contar
  // "às cegas" antes de revelar a diferença é o ponto: confirmar primeiro, comparar depois.
  dinheiroContadoConfirmado: boolean;
  // Passo intermediário (pedido do usuário, 25/09/2026): depois de preencher Notas E Moedas,
  // aparece um checkbox "Confirma esses valores contados?" — marcar trava só esses dois campos
  // (o Lacre final continua editável). Não precisa ir pro banco: uma vez que
  // `dinheiroContadoConfirmado` também fica true (confirmação final, com o lacre), esse
  // intermediário já fica implícito/redundante — só existe em memória no client.
  dinheiroContadoValoresConfirmados: boolean;

  // Fluxo de Caixa (18/09/2026): liga este fechamento à sessão de caixa que o originou —
  // `null` quando não veio de uma sessão (ex.: fechamento criado direto pelo admin). Quando
  // presente, Caixa/Turno da Seção 1 ficam travados no valor da sessão (ver
  // SecaoIdentificacao.vue) e o wizard fecha a sessão automaticamente ao salvar (ver
  // WizardFechamento.vue).
  cashSessionId: string | null;

  // Lacre digitado na abertura do caixa (pedido do usuário, 22/09/2026): identifica o malote do
  // fundo de caixa que a Tesouraria já cadastrou com valor — usado só pra buscar esse valor
  // automaticamente em Transferências Automáticas (ver SecaoTransferencias.vue), nunca editado
  // aqui de novo.
  lacreAbertura: string;

  // Arquivos escolhidos (maquininha, foto/nota de lançamento) antes do primeiro salvamento. Eles
  // ficam apenas em memória: o Storage só aceita o upload depois que o fechamento existe no banco
  // (ver WizardFechamento.vue onSalvar). Chaves fixas 'img-manha'/'img-tarde' pra maquininha;
  // `lancamento-foto-${lancamentoId}`/`lancamento-foto-nota-${lancamentoId}` pra cada lançamento,
  // já que pode haver vários (despesa/mercadoria/retirada) no mesmo fechamento.
  arquivosPendentes?: Record<string, File>;
}

/**
 * Resumo de um fechamento salvo, pro deck/lista — mesmos campos do card atual, mais o
 * suficiente pra busca (que o contrato pede ampliar: hoje só cobre lançamentos/crediário,
 * aqui cobre também entradas/sangrias/discriminações).
 */
export interface FechamentoListItem {
  id: string;
  codigo: string;
  data: string;
  caixa: string;
  turno: string;
  responsavel: string;
  valorTotalFinalCents: number;
  diferencaCents: number;
  criadoEm: string;
  entradas: { lacre: string; descricao: string; valorCents: number }[];
  sangrias: { lacre: string; descricao: string; valorCents: number }[];
  transferenciasCaixa: {
    caixaOrigem: string;
    caixaDestino: string;
    lacre: string;
    valorCents: number;
  }[];
  lancamentos: { tipo: string; status: string; fornecedor: string; valorCents: number }[];
  discriminacoes: { produto: string }[];
  crediario: { tipo: string; nome: string; valorCents: number }[];
}

function gerarCodigo(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `FC-${ts}-${rand}`;
}

export function hojeISO(): string {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Contexto de uma sessão de caixa ABERTA, repassado por `pages/fechamentos/novo.vue` quando o
 * usuário logado tem uma (ver `useSessaoCaixa.ts`) — trava Caixa/Turno/Data no valor da sessão. */
export interface ContextoSessaoCaixa {
  id: string;
  caixa: Caixa;
  turno: Turno;
  businessDate: string;
  lacreAbertura: string;
}

/** Estado inicial de um fechamento novo — mesma lógica de `novoFechamento()`/`resetarFormulario()`. */
export function criarFechamentoVazio(contexto?: ContextoSessaoCaixa): FechamentoDraft {
  return {
    // Gerado no client desde já (não só ao salvar) para os anexos (Storage) terem um caminho
    // estável mesmo antes do primeiro "Salvar" — o RPC aceita esse id como o da linha final.
    id: crypto.randomUUID(),
    codigo: gerarCodigo(),
    data: contexto?.businessDate ?? hojeISO(),
    caixa: contexto?.caixa ?? '',
    turno: contexto?.turno ?? '',
    responsavel: '',
    entradas: [],
    sangrias: [],
    transferenciasCaixa: [],
    lancamentos: [],
    relatorioPdv: '',
    pdvEntradas: [],
    imgPdvPath: null,
    nrMaquininha: '',
    nrMaquininhaTarde: '',
    manhaInicialCents: 0,
    tardeFinalCents: 0,
    creditoManhaCents: 0,
    debitoManhaCents: 0,
    pixManhaCents: 0,
    voucherManhaCents: 0,
    detalhesMaquininhaManha: criarDetalhesMaquininhaVazios(),
    imgManhaPath: null,
    creditoTardeCents: 0,
    debitoTardeCents: 0,
    pixTardeCents: 0,
    voucherTardeCents: 0,
    detalhesMaquininhaTarde: criarDetalhesMaquininhaVazios(),
    imgTardePath: null,
    crediario: [],
    discriminacoes: [],
    vendasCanceladasMotivoTipo: 'texto',
    vendasCanceladasMotivoTexto: '',
    vendasCanceladasMotivoAudioPath: null,
    vendasCanceladasMotivos: {},
    dinheiroContadoCents: 0,
    dinheiroContadoNotasCents: 0,
    dinheiroContadoMoedasCents: 0,
    lacreFechamento: '',
    dinheiroContadoConfirmado: false,
    dinheiroContadoValoresConfirmados: false,
    cashSessionId: contexto?.id ?? null,
    lacreAbertura: contexto?.lacreAbertura ?? '',
    arquivosPendentes: {},
  };
}
