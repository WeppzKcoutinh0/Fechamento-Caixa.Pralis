import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { adquirirLock, liberarLock } from '../src/lockService.js';

const MAX = 30 * 60_000;

async function escreverLock(caminho, conteudo) {
  await mkdir(path.dirname(caminho), { recursive: true });
  await writeFile(caminho, conteudo, 'utf8');
}

async function existe(caminho) {
  try {
    await readFile(caminho, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function comDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lock-'));
  try {
    await fn(path.join(dir, 'agente.lock'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('adquirirLock: livre -> adquire e cria o arquivo', async () => {
  await comDir(async (arq) => {
    await adquirirLock(arq, { maxIdadeMs: MAX });
    assert.equal(await existe(arq), true);
  });
});

test('adquirirLock: lock fresco de processo vivo (o proprio) -> lança erro', async () => {
  await comDir(async (arq) => {
    await escreverLock(arq, `${process.pid}\n${new Date().toISOString()}`);
    await assert.rejects(() => adquirirLock(arq, { maxIdadeMs: MAX }), /em andamento/);
  });
});

test('adquirirLock: PID morto -> rouba', async () => {
  await comDir(async (arq) => {
    await escreverLock(arq, `999999\n${new Date().toISOString()}`);
    await adquirirLock(arq, { maxIdadeMs: MAX });
    assert.equal(await existe(arq), true);
  });
});

test('adquirirLock: lock obsoleto (velho) -> rouba mesmo com pid vivo', async () => {
  await comDir(async (arq) => {
    const antigo = new Date(Date.now() - 60 * 60_000).toISOString();
    await escreverLock(arq, `${process.pid}\n${antigo}`);
    await mkdir(path.dirname(arq), { recursive: true });
    // mtime do arquivo precisa refletir "antigo" — writeFile já usa "agora", entao simulamos
    // idade com maxIdadeMs pequeno em vez de mexer no mtime do arquivo.
    await adquirirLock(arq, { maxIdadeMs: 0 });
    assert.equal(await existe(arq), true);
  });
});

test('liberarLock: remove o arquivo', async () => {
  await comDir(async (arq) => {
    await adquirirLock(arq, { maxIdadeMs: MAX });
    await liberarLock(arq);
    assert.equal(await existe(arq), false);
  });
});
