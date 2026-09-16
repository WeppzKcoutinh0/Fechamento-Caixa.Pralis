import test from 'node:test';
import assert from 'node:assert/strict';
import { dataInicioReprocesso, formatDateTime, hojeYMD } from '../src/dateService.js';

test('hojeYMD: formato YYYY-MM-DD', () => {
  assert.match(hojeYMD(), /^\d{4}-\d{2}-\d{2}$/);
});

test('dataInicioReprocesso: N dias antes de hoje, formato YYYY-MM-DD', () => {
  const hoje = hojeYMD();
  const tresDiasAntes = dataInicioReprocesso(3);
  assert.match(tresDiasAntes, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(tresDiasAntes, hoje);
  assert.ok(tresDiasAntes < hoje);
});

test('dataInicioReprocesso: 0 dias = hoje', () => {
  assert.equal(dataInicioReprocesso(0), hojeYMD());
});

test('formatDateTime: "YYYY-MM-DD HH:mm:ss"', () => {
  assert.match(formatDateTime(new Date('2026-08-21T14:23:00.000Z')), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});
