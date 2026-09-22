/**
 * Resumo do painel inicial — cálculo puro (mesma convenção de `utils/vendas.ts`/`financeiro.ts`),
 * a partir da lista de fechamentos já carregada pelo deck (`useFechamentos().listar()`). Nenhum
 * número aqui é inventado: tudo é somado dos fechamentos reais salvos no Supabase. Sem conceito de
 * "caixa aberto" (não existe nesse app) — só o que os fechamentos já registrados contam.
 */
import type { FechamentoListItem } from '~/types/fechamento';

export interface ResumoPainel {
  entradasHojeCents: number;
  despesasHojeCents: number;
  mercadoriasHojeCents: number;
  retiradasHojeCents: number;
  resultadoHojeCents: number;
  fechamentosHoje: number;
  fechamentosMes: number;
  diferencasPendentesMes: number;
}

function somaLancamentosPorTipo(lista: FechamentoListItem[], tipo: string): number {
  return lista.reduce(
    (total, f) =>
      total +
      f.lancamentos.filter((l) => l.tipo === tipo).reduce((soma, l) => soma + l.valorCents, 0),
    0,
  );
}

function somaEntradas(lista: FechamentoListItem[]): number {
  return lista.reduce(
    (total, f) => total + f.entradas.reduce((soma, e) => soma + e.valorCents, 0),
    0,
  );
}

function somaDiferenca(lista: FechamentoListItem[]): number {
  return lista.reduce((total, f) => total + f.diferencaCents, 0);
}

/** `hojeISO`/mês injetados (não `new Date()` aqui dentro) para a função continuar pura e testável. */
export function calcularResumoPainel(
  fechamentos: FechamentoListItem[],
  hojeISO: string,
): ResumoPainel {
  const mesAtual = hojeISO.slice(0, 7); // "YYYY-MM"
  const doHoje = fechamentos.filter((f) => f.data === hojeISO);
  const doMes = fechamentos.filter((f) => f.data.startsWith(mesAtual));

  return {
    entradasHojeCents: somaEntradas(doHoje),
    despesasHojeCents: somaLancamentosPorTipo(doHoje, 'despesa'),
    mercadoriasHojeCents: somaLancamentosPorTipo(doHoje, 'mercadoria'),
    retiradasHojeCents: somaLancamentosPorTipo(doHoje, 'retirada'),
    resultadoHojeCents: somaDiferenca(doHoje),
    fechamentosHoje: doHoje.length,
    fechamentosMes: doMes.length,
    diferencasPendentesMes: doMes.filter((f) => f.diferencaCents !== 0).length,
  };
}
