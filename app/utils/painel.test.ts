import { describe, expect, it } from 'vitest';
import { calcularResumoPainel } from './painel';
import type { FechamentoListItem } from '~/types/fechamento';

function fechamento(overrides: Partial<FechamentoListItem>): FechamentoListItem {
  return {
    id: 'x',
    codigo: 'FC-X',
    data: '2026-09-15',
    caixa: 'Caixa 1',
    turno: 'Manhã',
    responsavel: '',
    valorTotalFinalCents: 0,
    diferencaCents: 0,
    criadoEm: '2026-09-15T10:00:00Z',
    entradas: [],
    sangrias: [],
    transferenciasCaixa: [],
    lancamentos: [],
    discriminacoes: [],
    crediario: [],
    ...overrides,
  };
}

describe('calcularResumoPainel', () => {
  it('lista vazia devolve tudo zerado', () => {
    const resumo = calcularResumoPainel([], '2026-09-15');
    expect(resumo).toEqual({
      entradasHojeCents: 0,
      despesasHojeCents: 0,
      mercadoriasHojeCents: 0,
      retiradasHojeCents: 0,
      resultadoHojeCents: 0,
      fechamentosHoje: 0,
      fechamentosMes: 0,
      diferencasPendentesMes: 0,
    });
  });

  it('soma entradas e lançamentos por tipo, só do dia pedido', () => {
    const fechamentos = [
      fechamento({
        data: '2026-09-15',
        entradas: [{ lacre: '1', descricao: '', valorCents: 10000 }],
        lancamentos: [
          { tipo: 'despesa', status: 'pago', fornecedor: '', valorCents: 3000 },
          { tipo: 'mercadoria', status: 'pago', fornecedor: '', valorCents: 2000 },
          { tipo: 'retirada', status: 'pago', fornecedor: '', valorCents: 1000 },
        ],
        diferencaCents: 500,
      }),
      // Fechamento de outro dia não deve entrar nas somas de "hoje".
      fechamento({
        data: '2026-09-14',
        entradas: [{ lacre: '2', descricao: '', valorCents: 99999 }],
      }),
    ];

    const resumo = calcularResumoPainel(fechamentos, '2026-09-15');
    expect(resumo.entradasHojeCents).toBe(10000);
    expect(resumo.despesasHojeCents).toBe(3000);
    expect(resumo.mercadoriasHojeCents).toBe(2000);
    expect(resumo.retiradasHojeCents).toBe(1000);
    expect(resumo.resultadoHojeCents).toBe(500);
    expect(resumo.fechamentosHoje).toBe(1);
  });

  it('conta fechamentos do mês e diferenças pendentes (diferença != 0), ignorando outros meses', () => {
    const fechamentos = [
      fechamento({ data: '2026-09-01', diferencaCents: 0 }),
      fechamento({ data: '2026-09-10', diferencaCents: 500 }),
      fechamento({ data: '2026-09-15', diferencaCents: -200 }),
      fechamento({ data: '2026-08-31', diferencaCents: 999 }), // mês anterior, não conta
    ];

    const resumo = calcularResumoPainel(fechamentos, '2026-09-15');
    expect(resumo.fechamentosMes).toBe(3);
    expect(resumo.diferencasPendentesMes).toBe(2);
  });
});
