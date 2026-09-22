import { describe, expect, it } from 'vitest';
import {
  calcularJanelaDatetime,
  extrairLinhas,
  somarValores,
  type FechamentoComItens,
} from './consultaPeriodo';

describe('calcularJanelaDatetime', () => {
  // Comparado em hora LOCAL de propósito: `<input type="time">` é sempre local (mesma convenção
  // do navegador do usuário), então a janela deve refletir o horário local de quem está filtrando
  // — não UTC. Testar via toISOString() quebraria conforme o fuso de quem roda o teste.
  it('monta início e fim a partir de data + horários', () => {
    const janela = calcularJanelaDatetime('2026-09-15', '08:00', '18:00');
    const inicio = new Date(janela.inicioISO);
    const fim = new Date(janela.fimISO);
    expect([inicio.getHours(), inicio.getMinutes()]).toEqual([8, 0]);
    expect([fim.getHours(), fim.getMinutes()]).toEqual([18, 0]);
  });

  it('sem horário informado, cobre o dia inteiro', () => {
    const janela = calcularJanelaDatetime('2026-09-15', '', '');
    const inicio = new Date(janela.inicioISO);
    const fim = new Date(janela.fimISO);
    expect([inicio.getHours(), inicio.getMinutes()]).toEqual([0, 0]);
    expect([fim.getHours(), fim.getMinutes()]).toEqual([23, 59]);
  });
});

function fechamento(overrides: Partial<FechamentoComItens>): FechamentoComItens {
  return {
    id: 'f1',
    codigo: 'FC-1',
    caixa: 'Caixa 1',
    turno: 'Manhã',
    criadoEm: '2026-09-15T10:00:00Z',
    entradas: [],
    sangrias: [],
    lancamentos: [],
    transferenciasCaixa: [],
    ...overrides,
  };
}

describe('extrairLinhas', () => {
  it('tipo "entradas": só entradas, ignora sangrias/lançamentos/transferências', () => {
    const linhas = extrairLinhas(
      [
        fechamento({
          entradas: [{ descricao: 'Troco', lacre: '1', valorCents: 10000 }],
          sangrias: [{ descricao: 'Sangria X', lacre: '2', valorCents: 5000 }],
          lancamentos: [{ tipo: 'despesa', fornecedor: 'Fornecedor', valorCents: 3000 }],
          transferenciasCaixa: [
            {
              caixaOrigem: 'Caixa 1',
              caixaDestino: 'Caixa 2',
              lacre: '3',
              observacao: '',
              valorCents: 7000,
            },
          ],
        }),
      ],
      'entradas',
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.descricao).toBe('Troco');
    expect(linhas[0]?.valorCents).toBe(10000);
  });

  it('tipo "transferencias": mostra a tabela real de transferências entre caixas', () => {
    const linhas = extrairLinhas(
      [
        fechamento({
          entradas: [{ descricao: 'Troco', lacre: '1', valorCents: 10000 }],
          transferenciasCaixa: [
            {
              caixaOrigem: 'Caixa 1',
              caixaDestino: 'Caixa 2',
              lacre: '9',
              observacao: 'Troco emprestado',
              valorCents: 7000,
            },
          ],
        }),
      ],
      'transferencias',
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.descricao).toBe('Troco emprestado');
    expect(linhas[0]?.detalhe).toBe('Caixa 1 → Caixa 2 · Lacre 9');
    expect(linhas[0]?.valorCents).toBe(7000);
  });

  it('tipo "saidas": sangrias + lançamentos, rótulo por tipo quando sem fornecedor', () => {
    const linhas = extrairLinhas(
      [
        fechamento({
          sangrias: [{ descricao: 'Sangria X', lacre: '2', valorCents: 5000 }],
          lancamentos: [{ tipo: 'mercadoria', fornecedor: '', valorCents: 2000 }],
        }),
      ],
      'saidas',
    );
    expect(linhas).toHaveLength(2);
    expect(linhas.find((l) => l.descricao === 'Sangria X')?.valorCents).toBe(5000);
    const mercadoria = linhas.find((l) => l.descricao === 'Mercadoria');
    expect(mercadoria?.detalhe).toBe('Mercadoria');
  });

  it('ordena por criadoEm', () => {
    const linhas = extrairLinhas(
      [
        fechamento({
          id: 'a',
          criadoEm: '2026-09-15T14:00:00Z',
          entradas: [{ descricao: 'Tarde', lacre: '', valorCents: 100 }],
        }),
        fechamento({
          id: 'b',
          criadoEm: '2026-09-15T09:00:00Z',
          entradas: [{ descricao: 'Manhã', lacre: '', valorCents: 100 }],
        }),
      ],
      'entradas',
    );
    expect(linhas.map((l) => l.descricao)).toEqual(['Manhã', 'Tarde']);
  });
});

describe('somarValores', () => {
  it('soma os valores das linhas', () => {
    const linhas = extrairLinhas(
      [
        fechamento({
          sangrias: [{ descricao: 'S', lacre: '', valorCents: 4000 }],
          lancamentos: [{ tipo: 'despesa', fornecedor: '', valorCents: 2000 }],
        }),
      ],
      'saidas',
    );
    expect(somarValores(linhas)).toBe(6000);
  });
});
