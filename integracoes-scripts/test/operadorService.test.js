import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarOperador } from '../src/operadorService.js';

test('interpretarOperador: "VND CAIXA PDV - 1M" -> caixa 1, turno M', () => {
  assert.deepEqual(interpretarOperador('VND CAIXA PDV - 1M'), { natureza: 'posto', caixa: '1', turno: 'M' });
});

test('interpretarOperador: "VND CAIXA PDV - 3T" -> caixa 3, turno T', () => {
  assert.deepEqual(interpretarOperador('VND CAIXA PDV - 3T'), { natureza: 'posto', caixa: '3', turno: 'T' });
});

test('interpretarOperador: login nominal (não é posto) -> natureza nominal, sem caixa/turno', () => {
  assert.deepEqual(interpretarOperador('Vanessa Sara de Souza'), { natureza: 'nominal', caixa: '', turno: '' });
});

test('interpretarOperador: vazio/nulo não lança', () => {
  assert.deepEqual(interpretarOperador(''), { natureza: 'nominal', caixa: '', turno: '' });
  assert.deepEqual(interpretarOperador(null), { natureza: 'nominal', caixa: '', turno: '' });
});
