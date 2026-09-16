// Adaptado de services/pralisSalesService.js do bot_padaria_v3 — mesmo contrato HTTP
// (POST {url}/vendas/importar, Authorization: Bearer, {tipo, linhas}) e a mesma estratégia de
// pendência em disco + replay no próximo ciclo. Diferença: aqui os valores vão como JSON limpo
// (number/ISO), não como string formatada pra planilha — nosso próprio endpoint aceita os dois
// formatos, então nada se perde se um dia apontarem o bot original pra cá também.
import fs from 'node:fs/promises';
import path from 'node:path';

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function postJson({ url, token, payload, timeoutMs = 30000 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resposta = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!resposta.ok) {
      const corpo = (await resposta.text()).slice(0, 500);
      const erro = new Error(`Pralis respondeu HTTP ${resposta.status}${corpo ? `: ${corpo}` : ''}`);
      erro.status = resposta.status;
      throw erro;
    }
    return resposta.json().catch(() => null);
  } finally {
    clearTimeout(timeout);
  }
}

async function comRetry(tarefa, { tentativas, baseMs }) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    try {
      return await tarefa();
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < tentativas) await esperar(baseMs * 2 ** (tentativa - 1));
    }
  }
  throw ultimoErro;
}

export class PralisClient {
  constructor({ apiUrl, token, estadoDir, retryTentativas = 4, retryBaseMs = 500 }) {
    this.apiUrl = apiUrl;
    this.token = token;
    this.dir = path.join(estadoDir, 'pendentes');
    this.retryTentativas = retryTentativas;
    this.retryBaseMs = retryBaseMs;
  }

  async ensureDir() {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async arquivosPendentes() {
    await this.ensureDir();
    const entradas = await fs.readdir(this.dir, { withFileTypes: true });
    return entradas.filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => path.join(this.dir, e.name)).sort();
  }

  async salvarPendente(payload) {
    await this.ensureDir();
    const id = `${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}`;
    const alvo = path.join(this.dir, `${id}.json`);
    await fs.writeFile(`${alvo}.tmp`, JSON.stringify(payload), 'utf8');
    await fs.rename(`${alvo}.tmp`, alvo);
    return alvo;
  }

  async enviar(payload) {
    return comRetry(
      () => postJson({ url: `${this.apiUrl}/vendas/importar`, token: this.token, payload }),
      { tentativas: this.retryTentativas, baseMs: this.retryBaseMs },
    );
  }

  /** Reenvia lotes que ficaram pendentes de um ciclo anterior. Nunca lança — best effort. */
  async reprocessarPendentes() {
    const arquivos = await this.arquivosPendentes();
    let enviados = 0;
    for (const arquivo of arquivos) {
      try {
        const payload = JSON.parse(await fs.readFile(arquivo, 'utf8'));
        await this.enviar(payload);
        await fs.unlink(arquivo);
        enviados += 1;
      } catch (erro) {
        return { arquivos: arquivos.length, enviados, pendentes: arquivos.length - enviados, erro: erro.message };
      }
    }
    return { arquivos: arquivos.length, enviados, pendentes: 0 };
  }

  /** Envia `linhas` (já em lotes de até 500, mesmo teto do bot original). Falha -> fica pendente. */
  async enviarLinhas(tipo, linhas) {
    if (linhas.length === 0) return { lotes: 0, enviados: 0, pendentes: 0 };

    const TAMANHO_LOTE = 500;
    const lotes = [];
    for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) lotes.push(linhas.slice(i, i + TAMANHO_LOTE));

    let enviados = 0;
    let pendentes = 0;
    let ultimoErro = null;

    for (const lote of lotes) {
      const payload = { tipo, linhas: lote };
      try {
        await this.enviar(payload);
        enviados += 1;
      } catch (erro) {
        await this.salvarPendente(payload);
        pendentes += 1;
        ultimoErro = erro.message;
      }
    }

    return { lotes: lotes.length, enviados, pendentes, erro: ultimoErro };
  }
}
