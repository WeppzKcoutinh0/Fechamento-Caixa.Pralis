import assert from 'node:assert/strict';
import test from 'node:test';
import { obterConfig } from '../src/env.js';

test('obterConfig usa sincronização de 1 minuto por padrão', () => {
  const nomes = [
    'SERVIDOR_CREARE_COMPILART',
    'BANCO_CREARE_COMPILART',
    'USUARIO_CREARE_COMPILART',
    'EMPRESA',
    'PRALIS_VENDAS_API_TOKEN',
    'SYNC_INTERVALO_MINUTOS',
  ];
  const anterior = Object.fromEntries(nomes.map((nome) => [nome, process.env[nome]]));
  try {
    process.env.SERVIDOR_CREARE_COMPILART = 'localhost';
    process.env.BANCO_CREARE_COMPILART = 'creare';
    process.env.USUARIO_CREARE_COMPILART = 'teste';
    process.env.EMPRESA = 'TNP CENTRAL';
    process.env.PRALIS_VENDAS_API_TOKEN = 'token-de-teste';
    delete process.env.SYNC_INTERVALO_MINUTOS;

    assert.equal(obterConfig().sincronizacao.intervaloMinutos, 1);
  } finally {
    for (const nome of nomes) {
      if (anterior[nome] === undefined) delete process.env[nome];
      else process.env[nome] = anterior[nome];
    }
  }
});
