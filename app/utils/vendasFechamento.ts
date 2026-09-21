/**
 * Resumo do dia a partir das linhas já sincronizadas de `vendas_fechamento_caixa_dia` (uma linha
 * por PDV/operador/dia) — cálculo puro, mesma convenção de `utils/painel.ts`/`utils/financeiro.ts`.
 */
import type { FechamentoDraft, Caixa, LancamentoDraft, TipoCredor, TipoLancamento, Turno } from '~/types/fechamento';
import type { ResumoVendasDia } from '~/types/vendasFechamento';
import { formatCents, toCents } from '~/utils/financeiro';

/**
 * "Caixa 1" -> "1" — o bot grava só o número na coluna `caixa` (extraído do texto do operador,
 * ex. "VND CAIXA PDV - 1M" -> caixa "1", turno "M", ver interpretarOperador do bot). `null` quando
 * ainda não há caixa selecionado no fechamento — busca continua sem esse filtro (todos os caixas).
 */
export function caixaParaNumero(caixa: Caixa | ''): string | null {
  const numero = caixa.replace(/^Caixa\s*/i, '').trim();
  return numero || null;
}

/** "Manhã" -> "M", "Tarde" -> "T" — mesma letra que o bot extrai do operador. */
export function turnoParaLetra(turno: Turno | ''): string | null {
  if (turno === 'Manhã') return 'M';
  if (turno === 'Tarde') return 'T';
  return null;
}

/**
 * Aplica um resumo de vendas já buscado ao PRIMEIRO PDV da lista (cria se ainda não existir,
 * atualiza se já existir) — usado pelos botões "Buscar vendas" da Identificação e "Buscar vendas
 * do dia" dos Relatórios, os dois preenchendo o mesmo destino. PDVs extras que o usuário tenha
 * adicionado manualmente (índice 1 em diante) não são tocados.
 */
export function aplicarResumoAoPrimeiroPdv(draft: FechamentoDraft, resumo: ResumoVendasDia): void {
  const valores = {
    nrClientes: resumo.numeroVendas,
    dinheiroCents: toCents(resumo.porForma.dinheiro),
    creditoCents: toCents(resumo.porForma.credito),
    debitoCents: toCents(resumo.porForma.debito),
    pixCents: toCents(resumo.porForma.pix),
    voucherCents: toCents(resumo.porForma.voucher),
    crediarioCents: toCents(resumo.porForma.crediario),
  };
  if (draft.pdvEntradas.length === 0) {
    draft.pdvEntradas.push({ id: crypto.randomUUID(), ...valores });
  } else {
    Object.assign(draft.pdvEntradas[0]!, valores);
  }
}

interface AjusteCategoria {
  chave: keyof ResumoVendasDia['ajustes'];
  rotulo: string;
  tipo: TipoLancamento;
  tipoCredor: TipoCredor;
}

// "Colaboradores" já tem categoria de credor própria (TIPOS_CREDOR); os outros não têm um
// credor melhor no modelo atual — ficam como 'fornecedor' só pra ocupar um valor válido. O
// `tipo` segue a mesma divisão visual/contábil da tela: colaboradores, alimentação e sócios são
// despesas; furto/roubo e sobra/perda são mercadorias.
const AJUSTES_CATEGORIAS: AjusteCategoria[] = [
  { chave: 'colaboradores', rotulo: 'Colaboradores', tipo: 'despesa', tipoCredor: 'colaborador' },
  { chave: 'alimentacao', rotulo: 'Alimentação/Lanches', tipo: 'despesa', tipoCredor: 'fornecedor' },
  { chave: 'rouboFurto', rotulo: 'Furto/Roubo', tipo: 'mercadoria', tipoCredor: 'fornecedor' },
  { chave: 'socios', rotulo: 'Sócios', tipo: 'despesa', tipoCredor: 'fornecedor' },
  { chave: 'sobraPerda', rotulo: 'Sobra/Perda', tipo: 'mercadoria', tipoCredor: 'fornecedor' },
];

/**
 * Cria (ou atualiza, se já existir) um lançamento por categoria de ajuste que o CREARE já manda
 * (Colaboradores/Alimentação-Lanches/Furto-Roubo/Sócios/Sobra-Perda — ver
 * `ResumoVendasDia.ajustes`) — pedido do usuário: até aqui esses valores só apareciam num aviso
 * informativo, sem entrar em nenhum cálculo; agora entram automaticamente como lançamentos
 * classificados por categoria (passo 3),
 * pelo MESMO caminho já testado de `calculateRelatorioFinal`/`calculateLancamentosPorTipo`, sem
 * nenhuma fórmula nova. `valorCents` usa o valor ABSOLUTO (toda Despesa é um valor positivo no
 * modelo atual) — o valor original com sinal fica registrado em `obsTexto` pra auditoria, caso o
 * CREARE mande um "Sobra/Perda" negativo (não há documentação do CREARE sobre o que um sinal
 * negativo significa aqui; o usuário pode corrigir o valor manualmente se a leitura como Despesa
 * não fizer sentido pro caso).
 *
 * Idempotente por `origemAjusteCreare` (nunca duplica numa nova busca): acha o lançamento da MESMA
 * categoria pela marca, atualiza o valor se existir, cria se não. Mesmo comportamento de
 * "sobrescreve no re-fetch" que `aplicarResumoAoPrimeiroPdv` já tinha pros campos de PDV — se o
 * usuário remover manualmente um lançamento automático e buscar vendas de novo pro mesmo dia, ele
 * volta (mesma lógica: buscar vendas é sempre a verdade mais recente, não um valor travado).
 * Categoria que chegou zerada (correção no CREARE) remove o lançamento automático anterior, se
 * houver — nunca mexe num lançamento criado manualmente pelo usuário.
 */
export function aplicarAjustesComoLancamentos(draft: FechamentoDraft, resumo: ResumoVendasDia): void {
  for (const { chave, rotulo, tipo, tipoCredor } of AJUSTES_CATEGORIAS) {
    const valorOriginal = Number(resumo.ajustes[chave]);
    const existente = draft.lancamentos.find((l) => l.origemAjusteCreare === chave);

    if (Math.abs(valorOriginal) < 0.005) {
      if (existente) draft.lancamentos.splice(draft.lancamentos.indexOf(existente), 1);
      continue;
    }

    const valorCents = toCents(Math.abs(valorOriginal));
    const sinal = valorOriginal < 0 ? '-' : '';
    const obsTexto = `Ajuste automático do CREARE (${rotulo}) — valor original: ${sinal}R$ ${formatCents(valorCents)}.`;

    if (existente) {
      // Normaliza também lançamentos criados antes da classificação por categoria. O marcador
      // `origemAjusteCreare` identifica um registro automático, então o tipo correto vem sempre
      // da configuração acima, sem depender do valor antigo persistido no rascunho.
      existente.tipo = tipo;
      existente.valorCents = valorCents;
      existente.obsTexto = obsTexto;
    } else {
      const novo: LancamentoDraft = {
        id: crypto.randomUUID(),
        tipo,
        status: 'naopago',
        dataRef: resumo.data,
        dataNfe: '',
        nNfe: '',
        fornecedor: `${rotulo} (CREARE)`,
        tipoMer: '',
        valorCents,
        valorAcrescimoCents: 0,
        tipoCredor,
        obsTipo: 'texto',
        obsTexto,
        obsAudioPath: null,
        fotoPath: null,
        vencimento: '',
        dataPagamento: '',
        fotoNotaPath: null,
        origemAjusteCreare: chave,
      };
      draft.lancamentos.push(novo);
    }
  }
}

export interface FechamentoCaixaDiaRow {
  numero_vendas: number | string;
  credito: number | string;
  debito: number | string;
  dinheiro: number | string;
  pix: number | string;
  voucher: number | string;
  clientes: number | string;
  outros: number | string;
  total_pagamento: number | string;
  colaboradores?: number | string | null;
  alimentacao?: number | string | null;
  roubo_furto?: number | string | null;
  socios?: number | string | null;
  sobra_perda?: number | string | null;
}

/** "2026-08-21" -> "21/08/2026", para as mensagens de feedback do botão "Buscar vendas". */
export function formatarDataBr(dataIso: string): string {
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function somar(registros: FechamentoCaixaDiaRow[], campo: keyof FechamentoCaixaDiaRow): number {
  return registros.reduce((total, registro) => total + Number(registro[campo] ?? 0), 0);
}

export function calcularResumoVendasDia(data: string, registros: FechamentoCaixaDiaRow[]): ResumoVendasDia {
  return {
    data,
    registros: registros.length,
    numeroVendas: somar(registros, 'numero_vendas'),
    totalPagamento: somar(registros, 'total_pagamento'),
    porForma: {
      dinheiro: somar(registros, 'dinheiro'),
      credito: somar(registros, 'credito'),
      debito: somar(registros, 'debito'),
      pix: somar(registros, 'pix'),
      voucher: somar(registros, 'voucher'),
      // CLIENTES é o "crediário" atual no CREARE — a coluna CREDIARIO sai zerada nas vendas
      // novas (ver comentário na query do bot: "virou CLIENTES").
      crediario: somar(registros, 'clientes'),
      outros: somar(registros, 'outros'),
    },
    ajustes: {
      colaboradores: somar(registros, 'colaboradores'),
      alimentacao: somar(registros, 'alimentacao'),
      rouboFurto: somar(registros, 'roubo_furto'),
      socios: somar(registros, 'socios'),
      sobraPerda: somar(registros, 'sobra_perda'),
    },
  };
}
