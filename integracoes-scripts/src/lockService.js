// Portado/adaptado de services/lockService.js do bot_padaria_v3 — mesma lógica (lock em arquivo,
// PID + idade, rouba lock morto/obsoleto), caminho movido pra dentro de SYNC_ESTADO_DIR.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

function processoVivo(pid) {
  if (!pid || Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function lerLock(caminho) {
  const bruto = await fs.readFile(caminho, 'utf8');
  const pid = Number(String(bruto).split(/\r?\n/)[0].trim());
  const stat = await fs.stat(caminho);
  return { pid, idadeMs: Date.now() - stat.mtimeMs };
}

export async function adquirirLock(caminho, { maxIdadeMs }) {
  await fs.mkdir(path.dirname(caminho), { recursive: true });

  let lock = null;
  try {
    lock = await lerLock(caminho);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  if (lock) {
    const minutos = Math.round(lock.idadeMs / 60000);
    if (lock.idadeMs <= maxIdadeMs && processoVivo(lock.pid)) {
      throw new Error(`Outra execucao esta em andamento (PID ${lock.pid}, comecou ha ${minutos} min): ${caminho}.`);
    }
    console.warn(`Lock abandonado/obsoleto (PID ${lock.pid}, ${minutos} min atras). Assumindo o lock.`);
    await fs.unlink(caminho).catch(() => {});
  }

  try {
    await fs.writeFile(caminho, `${process.pid}\n${new Date().toISOString()}`, { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`Outra execucao pegou o lock primeiro: ${caminho}`);
  }
}

export async function liberarLock(caminho) {
  await fs.unlink(caminho).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

let limpezaRegistrada = false;
export function registrarLimpeza(caminho) {
  if (limpezaRegistrada) return;
  limpezaRegistrada = true;
  const soltar = () => {
    try {
      fsSync.unlinkSync(caminho);
    } catch {
      // já foi
    }
  };
  process.once('exit', soltar);
  ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'].forEach((sinal) => {
    process.once(sinal, () => {
      soltar();
      process.exit(0);
    });
  });
}

export async function withLock(caminho, maxIdadeMs, callback) {
  registrarLimpeza(caminho);
  await adquirirLock(caminho, { maxIdadeMs });
  try {
    return await callback();
  } finally {
    await liberarLock(caminho);
  }
}
