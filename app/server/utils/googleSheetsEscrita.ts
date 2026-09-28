import {
  credenciaisDoRuntimeConfig,
  obterAccessToken,
  type ServiceAccountCredenciais,
} from './googleSheets';

/**
 * Escrita na Google Sheets (28/09/2026, pedido do usuário: exportar o fechamento inteiro pra uma
 * planilha assim que salvar) — 3 operações: garantir que a aba existe com o cabeçalho certo,
 * anexar uma linha nova, e anotar células específicas com o detalhe completo (produtos vendidos,
 * cancelados, etc.) via "nota" da célula — o triângulo no canto que abre um balão ao
 * clicar/passar o mouse, sem precisar de várias linhas/abas pra caber tudo.
 */

async function chamarSheetsApi(
  accessToken: string,
  caminho: string,
  opcoes: RequestInit = {},
): Promise<unknown> {
  const resposta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${caminho}`, {
    ...opcoes,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
  });
  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    throw new Error(`Sheets API (${caminho}) HTTP ${resposta.status}: ${corpo.slice(0, 400)}`);
  }
  return resposta.json();
}

/**
 * Garante que a aba `aba` existe (cria se não existir) e que a linha 1 tem `cabecalhos` — nunca
 * sobrescreve um cabeçalho que já esteja lá (só escreve se a linha 1 estiver vazia), pra não
 * embaralhar colunas de alguém que já reordenou manualmente. Devolve o `sheetId` numérico
 * (diferente do nome — a API de notas/formatação pede o id, não o título).
 */
export async function garantirAbaComCabecalho({
  credenciaisJson,
  spreadsheetId,
  aba,
  cabecalhos,
}: {
  credenciaisJson: string | ServiceAccountCredenciais;
  spreadsheetId: string;
  aba: string;
  cabecalhos: string[];
}): Promise<{ sheetId: number }> {
  const credenciais = credenciaisDoRuntimeConfig(credenciaisJson);
  const accessToken = await obterAccessToken(credenciais);

  const meta = (await chamarSheetsApi(
    accessToken,
    `${spreadsheetId}?fields=sheets.properties`,
  )) as { sheets?: { properties: { sheetId: number; title: string } }[] };

  let sheetId = meta.sheets?.find((s) => s.properties.title === aba)?.properties.sheetId;

  if (sheetId === undefined) {
    const criacao = (await chamarSheetsApi(accessToken, `${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: aba } } }] }),
    })) as { replies: { addSheet: { properties: { sheetId: number } } }[] };
    sheetId = criacao.replies[0]!.addSheet.properties.sheetId;
  }

  const primeiraLinha = (await chamarSheetsApi(
    accessToken,
    `${spreadsheetId}/values/${encodeURIComponent(`${aba}!1:1`)}`,
  )) as { values?: string[][] };
  if (!primeiraLinha.values || primeiraLinha.values.length === 0) {
    await chamarSheetsApi(
      accessToken,
      `${spreadsheetId}/values/${encodeURIComponent(`${aba}!A1`)}?valueInputOption=RAW`,
      { method: 'PUT', body: JSON.stringify({ values: [cabecalhos] }) },
    );
  }

  return { sheetId };
}

/** Uma nota pra anexar numa célula específica da linha recém-inserida (0-indexed, mesma ordem de `valores`). */
export interface NotaCelula {
  colunaIndice: number;
  texto: string;
}

/**
 * Anexa `valores` como uma linha nova no fim da aba, depois anota as células indicadas em
 * `notas` com o detalhe completo — duas chamadas à API porque `values.append` não aceita notas
 * (só valores), e o range devolvido por ela é o que diz EM QUE LINHA a nova entrada caiu de
 * verdade (a aba pode ter crescido entre o `garantirAbaComCabecalho` e agora).
 */
export async function anexarLinhaComNotas({
  credenciaisJson,
  spreadsheetId,
  aba,
  sheetId,
  valores,
  notas,
}: {
  credenciaisJson: string | ServiceAccountCredenciais;
  spreadsheetId: string;
  aba: string;
  sheetId: number;
  valores: (string | number)[];
  notas: NotaCelula[];
}): Promise<{ linha: number }> {
  const credenciais = credenciaisDoRuntimeConfig(credenciaisJson);
  const accessToken = await obterAccessToken(credenciais);

  const anexado = (await chamarSheetsApi(
    accessToken,
    `${spreadsheetId}/values/${encodeURIComponent(`${aba}!A:A`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: JSON.stringify({ values: [valores] }) },
  )) as { updates: { updatedRange: string } };

  // "aba!A15:S15" -> 15. A aba pode ter espaço/aspas no nome; pega só o número antes do "-" final.
  const match = /![A-Z]+(\d+):/.exec(anexado.updates.updatedRange);
  const linha = match ? Number(match[1]) : 0;
  if (!linha) throw new Error(`Não consegui achar a linha da célula anexada: ${anexado.updates.updatedRange}`);

  if (notas.length > 0) {
    await chamarSheetsApi(accessToken, `${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: notas.map(({ colunaIndice, texto }) => ({
          updateCells: {
            range: {
              sheetId,
              startRowIndex: linha - 1,
              endRowIndex: linha,
              startColumnIndex: colunaIndice,
              endColumnIndex: colunaIndice + 1,
            },
            rows: [{ values: [{ note: texto }] }],
            fields: 'note',
          },
        })),
      }),
    });
  }

  return { linha };
}
