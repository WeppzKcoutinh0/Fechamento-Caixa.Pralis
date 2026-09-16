import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PralisClient } from '../src/pralisClient.js';

async function comCliente(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'pralis-'));
  try {
    await fn(new PralisClient({ apiUrl: 'http://app.local', token: 'chave-123', estadoDir: dir, retryTentativas: 1, retryBaseMs: 1 }));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('enviarLinhas: sucesso não deixa pendência', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, opcoes) => {
    assert.equal(url, 'http://app.local/vendas/importar');
    assert.equal(opcoes.headers.authorization, 'Bearer chave-123');
    const corpo = JSON.parse(opcoes.body);
    assert.equal(corpo.tipo, 'fechamento_caixa_dia');
    return { ok: true, text: async () => '{}', json: async () => ({}) };
  });

  await comCliente(async (cliente) => {
    const resultado = await cliente.enviarLinhas('fechamento_caixa_dia', [{ HASH: 'a' }]);
    assert.deepEqual(resultado, { lotes: 1, enviados: 1, pendentes: 0, erro: null });
    const pendentes = await cliente.arquivosPendentes();
    assert.equal(pendentes.length, 0);
  });
});

test('enviarLinhas: lista vazia não chama a API', async (t) => {
  let chamou = false;
  t.mock.method(globalThis, 'fetch', async () => {
    chamou = true;
    return { ok: true, text: async () => '{}' };
  });

  await comCliente(async (cliente) => {
    const resultado = await cliente.enviarLinhas('fechamento_caixa_dia', []);
    assert.deepEqual(resultado, { lotes: 0, enviados: 0, pendentes: 0 });
    assert.equal(chamou, false);
  });
});

test('enviarLinhas: falha de rede salva pendente em vez de perder o lote', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('ECONNREFUSED');
  });

  await comCliente(async (cliente) => {
    const resultado = await cliente.enviarLinhas('fechamento_caixa_dia', [{ HASH: 'a' }]);
    assert.equal(resultado.enviados, 0);
    assert.equal(resultado.pendentes, 1);
    const pendentes = await cliente.arquivosPendentes();
    assert.equal(pendentes.length, 1);
  });
});

test('reprocessarPendentes: reenvia e remove o arquivo quando a API volta a responder', async (t) => {
  let falhar = true;
  t.mock.method(globalThis, 'fetch', async () => {
    if (falhar) throw new Error('fora do ar');
    return { ok: true, text: async () => '{}', json: async () => ({}) };
  });

  await comCliente(async (cliente) => {
    await cliente.enviarLinhas('fechamento_caixa_dia', [{ HASH: 'a' }]);
    assert.equal((await cliente.arquivosPendentes()).length, 1);

    falhar = false;
    const resultado = await cliente.reprocessarPendentes();
    assert.equal(resultado.enviados, 1);
    assert.equal(resultado.pendentes, 0);
    assert.equal((await cliente.arquivosPendentes()).length, 0);
  });
});

test('enviarLinhas: HTTP não-2xx também vira pendência (erro estruturado)', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 401, text: async () => 'Chave invalida' }));

  await comCliente(async (cliente) => {
    const resultado = await cliente.enviarLinhas('fechamento_caixa_dia', [{ HASH: 'a' }]);
    assert.equal(resultado.pendentes, 1);
    assert.match(resultado.erro, /HTTP 401/);
  });
});
