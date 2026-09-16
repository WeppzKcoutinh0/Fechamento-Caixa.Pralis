// Caminho ALTERNATIVO ao `sincronizar.js`: em vez de ler o CREARE direto (precisa de uma máquina
// rodando na LAN da loja), lê a planilha Google Sheets que o bot_padaria_v3 já preenche — os
// dados já existem lá (histórico e correntes), só precisa ser importado pro Supabase. Útil pra
// destravar rápido enquanto o agente `sincronizar.js`/`loop.js` não está instalado na loja.
//
// Reaproveita o MESMO endpoint/contrato (`PralisClient.enviarLinhas`) que `sincronizar.js` usa —
// o servidor não diferencia se a linha veio do CREARE direto ou da planilha, só valida o formato
// e deduplica por HASH (que a planilha já traz calculado pelo bot original).
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PralisClient } from './pralisClient.js';
import { lerAba } from './sheetsRepository.js';

const raizProjeto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function obterObrigatoria(nome) {
  const valor = process.env[nome]?.trim();
  if (!valor) throw new Error(`Variavel de ambiente obrigatoria nao informada: ${nome}`);
  return valor;
}

function obterConfigPlanilha() {
  return {
    empresa: obterObrigatoria('EMPRESA'),
    google: {
      keyFile: obterObrigatoria('GOOGLE_SERVICE_ACCOUNT_FILE'),
      spreadsheetId: obterObrigatoria('GOOGLE_SPREADSHEET_ID'),
      // VENDAS_PRODUTOS mora numa SEGUNDA planilha desde 20/08/2026 (config.yaml
      // ABAS_EM_PLANILHA_SECUNDARIA) pra aliviar a principal do limite de 10M células do Google.
      // Se não vier configurada, cai pra planilha principal (compatível com config antigo).
      spreadsheetIdProdutos: process.env.GOOGLE_SPREADSHEET_ID_SECUNDARIO?.trim() || undefined,
      colunaInicial: process.env.COLUNA_INICIAL?.trim() || 'F',
    },
    pralis: {
      apiUrl: (process.env.PRALIS_VENDAS_API_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, ''),
      token: obterObrigatoria('PRALIS_VENDAS_API_TOKEN'),
    },
    estadoDir: process.env.SYNC_ESTADO_DIR?.trim() || '.estado',
  };
}

/** Só linhas da EMPRESA configurada — a planilha pode ter mais de uma loja misturada. */
function filtrarPorEmpresa(linhas, empresa) {
  return linhas.filter((linha) => String(linha.EMPRESA ?? '').trim() === empresa);
}

export async function importarDaPlanilha(config) {
  const caminhoKeyFile = path.isAbsolute(config.google.keyFile)
    ? config.google.keyFile
    : path.join(raizProjeto, config.google.keyFile);
  const estadoDir = path.isAbsolute(config.estadoDir) ? config.estadoDir : path.join(raizProjeto, config.estadoDir);

  const cliente = new PralisClient({ apiUrl: config.pralis.apiUrl, token: config.pralis.token, estadoDir });

  const pendentes = await cliente.reprocessarPendentes();
  console.log(
    `[importarPlanilha] pendentes anteriores: arquivos=${pendentes.arquivos} enviados=${pendentes.enviados} pendentes=${pendentes.pendentes}` +
      (pendentes.erro ? ` erro=${pendentes.erro}` : ''),
  );

  const todasFechamento = await lerAba({
    keyFile: caminhoKeyFile,
    spreadsheetId: config.google.spreadsheetId,
    aba: 'FECHAMENTOS_CAIXAS',
    colunaInicial: config.google.colunaInicial,
  });
  const linhasFechamento = filtrarPorEmpresa(todasFechamento, config.empresa);
  const envioFechamento = await cliente.enviarLinhas('fechamento_caixa_dia', linhasFechamento);
  console.log(
    `[importarPlanilha] fechamento_caixa_dia: planilha=${todasFechamento.length} empresa=${linhasFechamento.length} ` +
      `lotes=${envioFechamento.lotes} enviados=${envioFechamento.enviados} pendentes=${envioFechamento.pendentes}` +
      (envioFechamento.erro ? ` erro=${envioFechamento.erro}` : ''),
  );

  const todosProdutos = await lerAba({
    keyFile: caminhoKeyFile,
    spreadsheetId: config.google.spreadsheetIdProdutos ?? config.google.spreadsheetId,
    aba: 'VENDAS_PRODUTOS',
    colunaInicial: config.google.colunaInicial,
  });
  const linhasProdutos = filtrarPorEmpresa(todosProdutos, config.empresa);
  const envioProdutos = await cliente.enviarLinhas('venda_produto_dia', linhasProdutos);
  console.log(
    `[importarPlanilha] venda_produto_dia: planilha=${todosProdutos.length} empresa=${linhasProdutos.length} ` +
      `lotes=${envioProdutos.lotes} enviados=${envioProdutos.enviados} pendentes=${envioProdutos.pendentes}` +
      (envioProdutos.erro ? ` erro=${envioProdutos.erro}` : ''),
  );

  return {
    fechamentoCaixa: { lidas: linhasFechamento.length, ...envioFechamento },
    vendasProdutos: { lidas: linhasProdutos.length, ...envioProdutos },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  importarDaPlanilha(obterConfigPlanilha()).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
