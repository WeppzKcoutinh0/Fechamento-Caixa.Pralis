// Portado verbatim de services/hashService.js do bot_padaria_v3 — mesmo algoritmo, pra um mesmo
// registro produzir o mesmo HASH não importa qual instância do bot o gerou.
import crypto from 'node:crypto';

function text(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function hashParts(parts) {
  return crypto
    .createHash('sha256')
    .update(parts.map((part) => text(part).trim()).join(''))
    .digest('hex');
}

export { text, hashParts };
