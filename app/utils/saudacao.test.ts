import { describe, expect, it } from 'vitest';
import { faixaDoDia, horaDoNegocio, lerRelogio, textoDaSaudacao } from './saudacao';

describe('faixaDoDia', () => {
  it('05h-11h59 é bom-dia', () => {
    expect(faixaDoDia(5)).toBe('bom-dia');
    expect(faixaDoDia(11)).toBe('bom-dia');
  });
  it('12h-17h59 é boa-tarde', () => {
    expect(faixaDoDia(12)).toBe('boa-tarde');
    expect(faixaDoDia(17)).toBe('boa-tarde');
  });
  it('18h-04h59 (atravessa a meia-noite) é boa-noite', () => {
    expect(faixaDoDia(18)).toBe('boa-noite');
    expect(faixaDoDia(23)).toBe('boa-noite');
    expect(faixaDoDia(0)).toBe('boa-noite');
    expect(faixaDoDia(4)).toBe('boa-noite');
  });
});

describe('textoDaSaudacao', () => {
  it('mapeia a faixa para o texto em português', () => {
    expect(textoDaSaudacao(8)).toBe('Bom dia');
    expect(textoDaSaudacao(14)).toBe('Boa tarde');
    expect(textoDaSaudacao(2)).toBe('Boa noite');
  });
});

describe('horaDoNegocio', () => {
  it('lê a hora no fuso America/Sao_Paulo, não no fuso local do processo', () => {
    // 2026-09-15T14:30:00Z = 11:30 em Brasília (UTC-3)
    expect(horaDoNegocio(new Date('2026-09-15T14:30:00.000Z'))).toBe(11);
  });
});

describe('lerRelogio', () => {
  it('devolve hora, data e saudação consistentes', () => {
    const relogio = lerRelogio(new Date('2026-09-15T14:30:00.000Z'));
    expect(relogio.hora).toBe('11:30');
    expect(relogio.saudacao).toBe('Bom dia');
    expect(relogio.data).toContain('setembro');
  });
});
