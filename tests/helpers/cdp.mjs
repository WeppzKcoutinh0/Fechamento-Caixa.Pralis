import http from 'node:http';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(error => error ? reject(error) : resolve(address.port));
    });
  });
}

function browserCandidates() {
  const local = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  return [
    process.env.BROWSER_PATH,
    path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
}

async function pathExists(candidate) {
  try {
    const { access } = await import('node:fs/promises');
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function findBrowser() {
  for (const candidate of browserCandidates()) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error('Microsoft Edge/Google Chrome não encontrado. Defina BROWSER_PATH.');
}

function getJson(port, route) {
  return new Promise((resolve, reject) => {
    const request = http.get({ host: '127.0.0.1', port, path: route, timeout: 1_000 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Resposta CDP inválida: ${error.message}`));
        }
      });
    });
    request.once('timeout', () => request.destroy(new Error('Timeout consultando CDP')));
    request.once('error', reject);
  });
}

async function waitForPageTarget(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const targets = await getJson(port, '/json/list');
      const page = targets.find(target => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Browser não disponibilizou uma página no CDP: ${lastError?.message || 'timeout'}`);
}

export class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout conectando ao WebSocket CDP')), 10_000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('Falha ao conectar ao WebSocket CDP'));
      }, { once: true });
    });
    this.socket.addEventListener('message', event => this.#onMessage(event.data));
    this.socket.addEventListener('close', () => {
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error('Conexão CDP encerrada'));
      }
      this.pending.clear();
    });
  }

  #onMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result);
      return;
    }
    const listeners = this.listeners.get(message.method) || [];
    for (const listener of [...listeners]) listener(message.params || {});
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) || [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
    return () => this.listeners.set(method, listeners.filter(item => item !== listener));
  }

  waitFor(method, predicate = () => true, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      let remove;
      const timer = setTimeout(() => {
        remove?.();
        reject(new Error(`Timeout aguardando evento ${method}`));
      }, timeoutMs);
      remove = this.on(method, params => {
        if (!predicate(params)) return;
        clearTimeout(timer);
        remove();
        resolve(params);
      });
    });
  }

  send(method, params = {}, timeoutMs = 10_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout executando ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.close();
  }
}

export async function launchBrowser() {
  const executable = await findBrowser();
  const port = await getFreePort();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'fechamento-e2e-'));
  const browser = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

  let browserStderr = '';
  browser.stderr.on('data', chunk => { browserStderr += chunk.toString(); });
  const pageTarget = await waitForPageTarget(port).catch(error => {
    throw new Error(`${error.message}\n${browserStderr.slice(-1_000)}`);
  });
  const client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();

  const stop = async () => {
    client.close();
    if (browser.exitCode === null) {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/pid', String(browser.pid), '/t', '/f'], {
          stdio: 'ignore',
          windowsHide: true,
        });
      } else {
        browser.kill('SIGTERM');
        await Promise.race([
          new Promise(resolve => browser.once('exit', resolve)),
          delay(2_000),
        ]);
        if (browser.exitCode === null) browser.kill('SIGKILL');
      }
    }
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  };

  return { client, executable, stop };
}

export async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || 'erro desconhecido';
    throw new Error(`Erro no contexto da página: ${description}`);
  }
  return result.result.value;
}

export async function navigate(client, url) {
  const loaded = client.waitFor('Page.loadEventFired', () => true, 15_000);
  await client.send('Page.navigate', { url });
  await loaded;
}

export async function setViewport(client, width, height = 900) {
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  });
}
