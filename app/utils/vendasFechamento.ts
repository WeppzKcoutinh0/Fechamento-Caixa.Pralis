/**
 * Resumo do dia a partir das linhas já sincronizadas de `vendas_fechamento_caixa_dia` (uma linha
 * por PDV/operador/dia) — cálculo puro, mesma convenção de `utils/painel.ts`/`utils/financeiro.ts`.
 */
import type { FechamentoDraft, Caixa, Turno } from '~/types/fechamento';
import type { ResumoVendasDia } from '~/types/vendasFechamento';
import { toCents } from '~/utils/financeiro';

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
