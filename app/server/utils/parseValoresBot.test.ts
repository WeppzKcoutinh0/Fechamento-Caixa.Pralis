import { describe, expect, it } from 'vitest';
import {
  extrairHoraBot,
  parseDataBot,
  parseDataHoraBot,
  parseInteiroBot,
  parseInteiroOuNuloBot,
  parseNumeroBot,
} from './parseValoresBot';

describe('parseNumeroBot', () => {
  it('aceita vírgula decimal (formato do bot)', () => {
    expect(parseNumeroBot('1234,56')).toBeCloseTo(1234.56);
    expect(parseNumeroBot('0,00')).toBe(0);
  });

  it('aceita ponto decimal e number puro', () => {
    expect(parseNumeroBot('1234.56')).toBeCloseTo(1234.56);
    expect(parseNumeroBot(1234.56)).toBeCloseTo(1234.56);
  });

  it('remove o prefixo de aspa simples do Google Sheets', () => {
    expect(parseNumeroBot("'1234,56")).toBeCloseTo(1234.56);
  });

  it('vazio/nulo/inválido vira 0, nunca NaN', () => {
    expect(parseNumeroBot('')).toBe(0);
    expect(parseNumeroBot(null)).toBe(0);
    expect(parseNumeroBot(undefined)).toBe(0);
    expect(parseNumeroBot('abc')).toBe(0);
  });
});

describe('parseInteiroBot', () => {
  it('arredonda pro inteiro mais próximo', () => {
    expect(parseInteiroBot('5')).toBe(5);
    expect(parseInteiroBot('5,4')).toBe(5);
  });
});

describe('parseInteiroOuNuloBot', () => {
  it('arredonda pro inteiro mais próximo, igual parseInteiroBot', () => {
    expect(parseInteiroOuNuloBot('8')).toBe(8);
    expect(parseInteiroOuNuloBot('8,4')).toBe(8);
  });

  it('diferente de parseInteiroBot: vazio/nulo vira null, não 0 — 0 é um valor real (meia-noite)', () => {
    expect(parseInteiroOuNuloBot('')).toBeNull();
    expect(parseInteiroOuNuloBot(null)).toBeNull();
    expect(parseInteiroOuNuloBot(undefined)).toBeNull();
    expect(parseInteiroOuNuloBot('0')).toBe(0);
  });

  it('remove o prefixo de aspa simples do Google Sheets', () => {
    expect(parseInteiroOuNuloBot("'8")).toBe(8);
  });
});

describe('parseDataBot', () => {
  it('converte DD/MM/YYYY (formato real do bot) para YYYY-MM-DD', () => {
    expect(parseDataBot('21/08/2026')).toBe('2026-08-21');
  });

  it('aceita YYYY-MM-DD direto', () => {
    expect(parseDataBot('2026-08-21')).toBe('2026-08-21');
  });

  it('remove o prefixo de aspa simples do Google Sheets', () => {
    expect(parseDataBot("'21/08/2026")).toBe('2026-08-21');
  });

  it('vazio/inválido vira null', () => {
    expect(parseDataBot('')).toBeNull();
    expect(parseDataBot(null)).toBeNull();
    expect(parseDataBot('não é data')).toBeNull();
  });
});

describe('parseDataHoraBot', () => {
  it('converte "YYYY-MM-DD HH:MM:SS" (sem fuso) assumindo America/Sao_Paulo', () => {
    const iso = parseDataHoraBot('2026-08-21 14:23:00');
    expect(iso).toBe(new Date('2026-08-21T14:23:00-03:00').toISOString());
  });

  it('remove o prefixo de aspa simples e ainda converte', () => {
    const iso = parseDataHoraBot("'2026-08-21 14:23:00");
    expect(iso).toBe(new Date('2026-08-21T14:23:00-03:00').toISOString());
  });

  it('aceita ISO com fuso explícito sem reinterpretar', () => {
    const original = '2026-08-21T17:23:00.000Z';
    expect(parseDataHoraBot(original)).toBe(new Date(original).toISOString());
  });

  it('vazio/inválido vira null', () => {
    expect(parseDataHoraBot('')).toBeNull();
    expect(parseDataHoraBot(null)).toBeNull();
    expect(parseDataHoraBot('lixo')).toBeNull();
  });
});

describe('extrairHoraBot', () => {
  it('extrai só o horário de "YYYY-MM-DD HH:MM:SS", sem conversão de fuso', () => {
    expect(extrairHoraBot('2026-09-24 13:34:27')).toBe('13:34:27');
  });

  it('aceita separador "T" também', () => {
    expect(extrairHoraBot('2026-09-24T13:34:27')).toBe('13:34:27');
  });

  it('remove o prefixo de aspa simples do Google Sheets', () => {
    expect(extrairHoraBot("'2026-09-24 13:34:27")).toBe('13:34:27');
  });

  it('vazio/inválido/só data vira null', () => {
    expect(extrairHoraBot('')).toBeNull();
    expect(extrairHoraBot(null)).toBeNull();
    expect(extrairHoraBot('2026-09-24')).toBeNull();
    expect(extrairHoraBot('lixo')).toBeNull();
  });
});
