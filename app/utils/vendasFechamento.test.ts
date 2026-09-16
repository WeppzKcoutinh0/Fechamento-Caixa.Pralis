import { describe, expect, it } from 'vitest';
import { criarFechamentoVazio } from '~/types/fechamento';
import type { ResumoVendasDia } from '~/types/vendasFechamento';
import {
  aplicarAjustesComoLancamentos,
  caixaParaNumero,
  calcularResumoVendasDia,
  formatarDataBr,
  turnoParaLetra,
  type FechamentoCaixaDiaRow,
} from './vendasFechamento';

describe('formatarDataBr', () => {
  it('converte yyyy-mm-dd para dd/mm/yyyy', () => {
    expect(formatarDataBr('2026-08-21')).toBe('21/08/2026');
  });
});

describe('caixaParaNumero', () => {
  it('extrai o número de "Caixa N"', () => {
    expect(caixaParaNumero('Caixa 1')).toBe('1');
    expect(caixaParaNumero('Caixa 4')).toBe('4');
  });

  it('sem caixa selecionado devolve null (busca sem filtro)', () => {
    expect(caixaParaNumero('')).toBeNull();
  });
});

describe('turnoParaLetra', () => {
  it('mapeia Manhã/Tarde pra M/T, mesma letra que o bot extrai do operador', () => {
    expect(turnoParaLetra('Manhã')).toBe('M');
    expect(turnoParaLetra('Tarde')).toBe('T');
  });

  it('sem turno selecionado devolve null', () => {
    expect(turnoParaLetra('')).toBeNull();
  });
});

function linha(overrides: Partial<FechamentoCaixaDiaRow>): FechamentoCaixaDiaRow {
  return {
    numero_vendas: 0,
    credito: 0,
    debito: 0,
    dinheiro: 0,
    pix: 0,
    voucher: 0,
    clientes: 0,
    outros: 0,
    total_pagamento: 0,
    ...overrides,
  };
}

describe('calcularResumoVendasDia', () => {
  it('lista vazia devolve tudo zerado', () => {
    const resumo = calcularResumoVendasDia('2026-08-21', []);
    expect(resumo.registros).toBe(0);
    expect(resumo.numeroVendas).toBe(0);
    expect(resumo.totalPagamento).toBe(0);
    expect(resumo.porForma.dinheiro).toBe(0);
    expect(resumo.ajustes.rouboFurto).toBe(0);
  });

  it('soma múltiplos PDVs/operadores do mesmo dia, aceitando valores como string (vindos do Postgres numeric)', () => {
    const registros = [
      linha({ numero_vendas: '128', credito: '1234,56'.replace(',', '.'), debito: 200, dinheiro: 300, pix: 50, voucher: 0, clientes: 100, outros: 0, total_pagamento: 1884.56 }),
      linha({ numero_vendas: 42, credito: 500, debito: 100, dinheiro: 150, pix: 20, voucher: 10, clientes: 0, outros: 5, total_pagamento: 785 }),
    ];

    const resumo = calcularResumoVendasDia('2026-08-21', registros);
    expect(resumo.registros).toBe(2);
    expect(resumo.numeroVendas).toBe(170);
    expect(resumo.porForma.credito).toBeCloseTo(1734.56);
    expect(resumo.porForma.dinheiro).toBeCloseTo(450);
    expect(resumo.porForma.crediario).toBeCloseTo(100);
    expect(resumo.totalPagamento).toBeCloseTo(2669.56);
  });

  it('soma colaboradores/alimentação/furto-roubo/sócios/sobra-perda separado, sem entrar em porForma/totalPagamento', () => {
    const registros = [
      linha({ total_pagamento: 100, colaboradores: 10, alimentacao: 5, roubo_furto: 20, socios: 8, sobra_perda: 3 }),
      linha({ total_pagamento: 50, colaboradores: 2, roubo_furto: 0 }),
    ];

    const resumo = calcularResumoVendasDia('2026-08-21', registros);
    expect(resumo.ajustes).toEqual({ colaboradores: 12, alimentacao: 5, rouboFurto: 20, socios: 8, sobraPerda: 3 });
    // Confirma que não vaza pra nenhum outro total — só o que já era somado antes continua.
    expect(resumo.totalPagamento).toBe(150);
  });

  it('linhas sem colaboradores/alimentação/etc (undefined, formato antigo) não quebram — viram 0', () => {
    const registros = [linha({ total_pagamento: 100 })];
    const resumo = calcularResumoVendasDia('2026-08-21', registros);
    expect(resumo.ajustes).toEqual({ colaboradores: 0, alimentacao: 0, rouboFurto: 0, socios: 0, sobraPerda: 0 });
  });
});

function resumoComAjustes(ajustes: Partial<ResumoVendasDia['ajustes']>): ResumoVendasDia {
  return {
    data: '2026-09-16',
    registros: 1,
    numeroVendas: 0,
    totalPagamento: 0,
    porForma: { dinheiro: 0, credito: 0, debito: 0, pix: 0, voucher: 0, crediario: 0, outros: 0 },
    ajustes: { colaboradores: 0, alimentacao: 0, rouboFurto: 0, socios: 0, sobraPerda: 0, ...ajustes },
  };
}

describe('aplicarAjustesComoLancamentos', () => {
  it('cria uma Despesa por categoria presente, colaboradores com tipoCredor "colaborador"', () => {
    const draft = criarFechamentoVazio();
    aplicarAjustesComoLancamentos(draft, resumoComAjustes({ colaboradores: 35.09, rouboFurto: 12 }));

    expect(draft.lancamentos).toHaveLength(2);
    const colab = draft.lancamentos.find((l) => l.origemAjusteCreare === 'colaboradores')!;
    expect(colab.tipo).toBe('despesa');
    expect(colab.tipoCredor).toBe('colaborador');
    expect(colab.valorCents).toBe(3509);
    expect(colab.dataRef).toBe('2026-09-16');

    const furto = draft.lancamentos.find((l) => l.origemAjusteCreare === 'rouboFurto')!;
    expect(furto.tipoCredor).toBe('fornecedor');
    expect(furto.valorCents).toBe(1200);
  });

  it('categoria zerada/ausente não cria lançamento', () => {
    const draft = criarFechamentoVazio();
    aplicarAjustesComoLancamentos(draft, resumoComAjustes({ colaboradores: 10 }));
    expect(draft.lancamentos).toHaveLength(1);
  });

  it('chamar de novo com valor diferente ATUALIZA o mesmo lançamento, não duplica', () => {
    const draft = criarFechamentoVazio();
    aplicarAjustesComoLancamentos(draft, resumoComAjustes({ colaboradores: 10 }));
    const idOriginal = draft.lancamentos[0]!.id;

    aplicarAjustesComoLancamentos(draft, resumoComAjustes({ colaboradores: 25 }));
    expect(draft.lancamentos).toHaveLength(1);
    expect(draft.lancamentos[0]!.id).toBe(idOriginal);
    expect(draft.lancamentos[0]!.valorCents).toBe(2500);
  });

  it('categoria que zera numa nova busca remove o lançamento automático anterior', () => {
    const draft = criarFechamentoVazio();
    aplicarAjustesComoLancamentos(draft, resumoComAjustes({ sobraPerda: 8 }));
    expect(draft.lancamentos).toHaveLength(1);

    aplicarAjustesComoLancamentos(draft, resumoComAjustes({ sobraPerda: 0 }));
    expect(draft.lancamentos).toHaveLength(0);
  });

  it('nunca mexe num lançamento manual (origemAjusteCreare vazio)', () => {
    const draft = criarFechamentoVazio();
    draft.lancamentos.push({
      id: 'manual-1',
      tipo: 'despesa',
      status: 'naopago',
      dataRef: '2026-09-16',
      dataNfe: '',
      nNfe: '',
      fornecedor: 'Lançado à mão',
      tipoMer: '',
      valorCents: 999,
      valorAcrescimoCents: 0,
      tipoCredor: 'fornecedor',
      obsTipo: '',
      obsTexto: '',
      obsAudioPath: null,
      fotoPath: null,
      vencimento: '',
      dataPagamento: '',
      fotoNotaPath: null,
      origemAjusteCreare: '',
    });

    aplicarAjustesComoLancamentos(draft, resumoComAjustes({ colaboradores: 10 }));
    expect(draft.lancamentos).toHaveLength(2);
    const manual = draft.lancamentos.find((l) => l.id === 'manual-1')!;
    expect(manual.valorCents).toBe(999);
  });

  it('valor negativo (ex.: sobra) vira Despesa com valor absoluto, sinal original registrado em obsTexto', () => {
    const draft = criarFechamentoVazio();
    aplicarAjustesComoLancamentos(draft, resumoComAjustes({ sobraPerda: -15.5 }));

    const lancamento = draft.lancamentos[0]!;
    expect(lancamento.valorCents).toBe(1550);
    expect(lancamento.obsTexto).toContain('-R$ 15,50');
  });
});
