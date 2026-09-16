import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { criarPoolCreare } from './database.js';
import {
  buscarFechamentoCaixa,
  buscarVendasProdutos,
  montarLinhaFechamentoCaixa,
  montarLinhaVendaProduto,
} from './creareRepository.js';
import { dataInicioReprocesso, formatDateTime } from './dateService.js';
import { obterConfig } from './env.js';
import { adquirirLock, liberarLock } from './lockService.js';
import { PralisClient } from './pralisClient.js';

const raizProjeto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function derivarCaminhos(config) {
  const estadoDir = path.isAbsolute(config.sincronizacao.estadoDir)
    ? config.sincronizacao.estadoDir
    : path.join(raizProjeto, config.sincronizacao.estadoDir);
  return { estadoDir, lockArquivo: path.join(estadoDir, 'agente.lock') };
}

// Um ciclo: reprocessa pendências de ciclos anteriores, lê o CREARE desde "hoje menos
// SYNC_DIAS_REPROCESSAR dias" (a query já devolve tudo até hoje, resumido por dia), monta as
// linhas no formato do endpoint e envia. Idempotente ponta a ponta — pode rodar de novo a
// qualquer momento sem duplicar nada no app (o servidor deduplica por HASH).
export async function executarCiclo(config, caminhos) {
  const sync = config.sincronizacao;
  const cliente = new PralisClient({
    apiUrl: config.pralis.apiUrl,
    token: config.pralis.token,
    estadoDir: caminhos.estadoDir,
    retryTentativas: sync.retryTentativas,
    retryBaseMs: sync.retryBaseMs,
  });

  const pendentes = await cliente.reprocessarPendentes();
  console.log(
    `[sincronizar] pendentes anteriores: arquivos=${pendentes.arquivos} enviados=${pendentes.enviados} pendentes=${pendentes.pendentes}` +
      (pendentes.erro ? ` erro=${pendentes.erro}` : ''),
  );

  const dataInicio = dataInicioReprocesso(sync.diasReprocessar);
  const agora = formatDateTime();
  const pool = criarPoolCreare(config.creare);

  const resultado = { fechamentoCaixa: null, vendasProdutos: null };
  try {
    const rowsFechamento = await buscarFechamentoCaixa(pool, dataInicio);
    const linhasFechamento = rowsFechamento.map((row) => montarLinhaFechamentoCaixa(row, { empresa: config.empresa, agora }));
    const envioFechamento = await cliente.enviarLinhas('fechamento_caixa_dia', linhasFechamento);
    resultado.fechamentoCaixa = { lidas: rowsFechamento.length, ...envioFechamento };
    console.log(
      `[sincronizar] fechamento_caixa_dia: desde=${dataInicio} lidas=${rowsFechamento.length} ` +
        `lotes=${envioFechamento.lotes} enviados=${envioFechamento.enviados} pendentes=${envioFechamento.pendentes}` +
        (envioFechamento.erro ? ` erro=${envioFechamento.erro}` : ''),
    );

    if (sync.enviarProdutos) {
      const rowsProdutos = await buscarVendasProdutos(pool, dataInicio);
      const linhasProdutos = rowsProdutos.map((row) => montarLinhaVendaProduto(row, { empresa: config.empresa, agora }));
      const envioProdutos = await cliente.enviarLinhas('venda_produto_dia', linhasProdutos);
      resultado.vendasProdutos = { lidas: rowsProdutos.length, ...envioProdutos };
      console.log(
        `[sincronizar] venda_produto_dia: desde=${dataInicio} lidas=${rowsProdutos.length} ` +
          `lotes=${envioProdutos.lotes} enviados=${envioProdutos.enviados} pendentes=${envioProdutos.pendentes}` +
          (envioProdutos.erro ? ` erro=${envioProdutos.erro}` : ''),
      );
    }
  } finally {
    await pool.end();
  }

  return resultado;
}

async function main() {
  const config = obterConfig();
  const caminhos = derivarCaminhos(config);
  const maxIdadeMs = config.sincronizacao.lockMaxMinutos * 60_000;

  try {
    await adquirirLock(caminhos.lockArquivo, { maxIdadeMs });
  } catch (erro) {
    console.log(`[sincronizar] ${erro.message} Pulando este ciclo.`);
    return;
  }

  try {
    await executarCiclo(config, caminhos);
  } finally {
    await liberarLock(caminhos.lockArquivo);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
