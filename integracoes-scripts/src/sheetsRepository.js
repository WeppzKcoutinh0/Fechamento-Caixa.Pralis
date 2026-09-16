// Caminho alternativo pra puxar vendas: em vez de ler o CREARE direto (precisa de uma máquina na
// LAN da loja), lê a MESMA planilha Google Sheets que o bot_padaria_v3 já preenche há meses —
// os dados já existem lá, formatados exatamente como o endpoint /vendas/importar espera (mesmas
// colunas UPPERCASE, mesmo HASH). Zero mudança no schema/validação: essas linhas passam pelo
// mesmo `linhaFechamentoCaixaDiaSchema` que uma linha vinda do CREARE passaria.
import { google } from 'googleapis';

/** Autentica com a service account do bot (mesmo arquivo .json que ele já usa pra escrever). */
async function criarClienteSheets(keyFile) {
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

/**
 * Lê uma aba inteira a partir de `colunaInicial` (o bot sempre escreve a partir da coluna F, ver
 * config.yaml COLUNA_INICIAL) e devolve como array de objetos, usando a primeira linha como
 * cabeçalho (DATA_VENDA, PDV, OPERADOR, ... — já vêm UPPERCASE, mesmas chaves do schema).
 */
export async function lerAba({ keyFile, spreadsheetId, aba, colunaInicial = 'F' }) {
  const sheets = await criarClienteSheets(keyFile);
  const resposta = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${aba}!${colunaInicial}:ZZ`,
    valueRenderOption: 'FORMATTED_VALUE',
  });

  const linhas = resposta.data.values ?? [];
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0].map((c) => String(c ?? '').trim());
  const registros = [];
  for (const linha of linhas.slice(1)) {
    const registro = {};
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
