import test from 'node:test';
import assert from 'node:assert/strict';
import { hashParts, text } from '../src/hashService.js';

test('hashParts: mesmas partes produzem o mesmo hash', () => {
  const a = hashParts(['CREARE_COMPILART', 'TNP CENTRAL', '21/08/2026', 'PDV 1', 'OP', '', '', 5, 100]);
  const b = hashParts(['CREARE_COMPILART', 'TNP CENTRAL', '21/08/2026', 'PDV 1', 'OP', '', '', 5, 100]);
  assert.equal(a, b);
});

test('hashParts: parte diferente produz hash diferente', () => {
  const a = hashParts(['x', 'y', 1]);
  const b = hashParts(['x', 'y', 2]);
  assert.notEqual(a, b);
});

test('text: null/undefined viram string vazia; Date vira ISO', () => {
  assert.equal(text(null), '');
  assert.equal(text(undefined), '');
  assert.equal(text(new Date('2026-01-01T00:00:00.000Z')), '2026-01-01T00:00:00.000Z');
  assert.equal(text(42), '42');
});
