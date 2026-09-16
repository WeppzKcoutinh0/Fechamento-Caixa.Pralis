import { createSign } from 'node:crypto';

/**
 * Leitura read-only da planilha Google Sheets que o `bot_padaria_v3` já preenche, sem depender do
 * pacote `googleapis` (pesado demais só pra isso) — autentica a service account assinando um JWT
 * na mão (RS256, igual o próprio Google documenta pro OAuth2 server-to-server) e troca por um
 * access token em `oauth2.googleapis.com/token`. Mesma credencial que
 * `integracoes-scripts/src/sheetsRepository.js` usa, só que aqui a chave vem de uma env var (JSON
 * da service account) em vez de um arquivo — dentro da função serverless da Vercel não há
 * filesystem persistente pra guardar o .json com segurança.
 */

interface ServiceAccountCredenciais {
  client_email: string;
  private_key: string;
}

let tokenCache: { token: string; expiraEm: number } | null = null;

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function obterAccessToken(credenciais: ServiceAccountCredenciais): Promise<string> {
  if (tokenCache && tokenCache.expiraEm > Date.now() + 60_000) return tokenCache.token;

  const agora = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: credenciais.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: agora,
      exp: agora + 3600,
    }),
  );
  const assinatura = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(credenciais.private_key);
  const jwt = `${header}.${claims}.${base64Url(assinatura)}`;

  const resposta = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    throw new Error(`Falha ao autenticar com o Google (${resposta.status}): ${corpo.slice(0, 300)}`);
  }
  const dados = (await resposta.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: dados.access_token, expiraEm: Date.now() + dados.expires_in * 1000 };
  return dados.access_token;
}

/**
 * Lê uma aba inteira a partir de `colunaInicial` (o bot sempre escreve a partir da coluna F) e
 * devolve como array de objetos, usando a primeira linha como cabeçalho (DATA_VENDA, PDV,
 * OPERADOR, ... já vêm UPPERCASE, mesmas chaves do schema).
 */
export async function lerAbaPlanilha({
  credenciaisJson,
  spreadsheetId,
  aba,
  colunaInicial = 'F',
}: {
  // O Nitro faz auto-parse (via `destr`) de env vars que "parecem" JSON antes de preencher o
  // runtimeConfig — apesar do default ser string (''), em runtime o valor pode chegar já como
  // objeto. Aceita os dois formatos pra não depender desse detalhe de implementação.
  credenciaisJson: string | ServiceAccountCredenciais;
  spreadsheetId: string;
  aba: string;
  colunaInicial?: string;
}): Promise<Record<string, string>[]> {
  let credenciais: ServiceAccountCredenciais;
  if (typeof credenciaisJson === 'string') {
    try {
      credenciais = JSON.parse(credenciaisJson);
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON inválido (não é um JSON válido).');
    }
  } else {
    credenciais = credenciaisJson;
  }
  if (!credenciais?.client_email || !credenciais?.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON sem client_email/private_key.');
  }

  const accessToken = await obterAccessToken(credenciais);
  const range = `${aba}!${colunaInicial}:ZZ`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;

  const resposta = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    throw new Error(`Falha ao ler a planilha (aba ${aba}, HTTP ${resposta.status}): ${corpo.slice(0, 300)}`);
  }
  const dados = (await resposta.json()) as { values?: string[][] };
  const linhas = dados.values ?? [];
  if (linhas.length === 0) return [];

  const cabecalho = (linhas[0] ?? []).map((c) => String(c ?? '').trim());
  const registros: Record<string, string>[] = [];
  for (const linha of linhas.slice(1)) {
    const registro: Record<string, string> = {};
    let temAlgumValor = false;
    cabecalho.forEach((coluna, indice) => {
      if (!coluna) return;
      const valor = linha[indice];
      if (valor !== undefined && valor !== '') temAlgumValor = true;
      registro[coluna] = valor ?? '';
    });
    if (temAlgumValor) registros.push(registro);
  }
  return registros;
}
