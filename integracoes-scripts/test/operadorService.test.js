import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarOperador } from '../src/operadorService.js';

test('interpretarOperador: "VND CAIXA PDV - 1M" -> caixa 1, turno M', () => {
  assert.deepEqual(interpretarOperador('VND CAIXA PDV - 1M'), { natureza: 'posto', caixa: '1', turno: 'M' });
});

test('interpretarOperador: "VND CAIXA PDV - 3T" -> caixa 3, turno T', () => {
  assert.deepEqual(interpretarOperador('VND CAIXA PDV - 3T'), { natureza: 'posto', caixa: '3', turno: 'T' });
});

test('interpretarOperador: reconhece os oito caixas/turnos e formatos equivalentes', () => {
  const casos = [
    ['VND CAIXA PDV - 1M', '1', 'M'],
    ['VND CAIXA PDV - 2M', '2', 'M'],
    ['VND CAIXA PDV - 3M', '3', 'M'],
    ['VND CAIXA PDV - 4M', '4', 'M'],
    ['VND CAIXA PDV - 1T', '1', 'T'],
    ['VND CAIXA PDV - 2T', '2', 'T'],
    ['VND CAIXA PDV - 3T', '3', 'T'],
    ['VND CAIXA PDV - 4T', '4', 'T'],
    ['Caixa 2 Manhã', '2', 'M'],
    ['PDV 3 - Tarde', '3', 'T'],
  ];
  for (const [operador, caixa, turno] of casos) {
    assert.deepEqual(interpretarOperador(operador), { natureza: 'posto', caixa, turno });
  }
});

test('interpretarOperador: login nominal (não é posto) -> natureza nominal, sem caixa/turno', () => {
  assert.deepEqual(interpretarOperador('Vanessa Sara de Souza'), { natureza: 'nominal', caixa: '', turno: '' });
});

test('interpretarOperador: vazio/nulo não lança', () => {
  assert.deepEqual(interpretarOperador(''), { natureza: 'nominal', caixa: '', turno: '' });
  assert.deepEqual(interpretarOperador(null), { natureza: 'nominal', caixa: '', turno: '' });
});
