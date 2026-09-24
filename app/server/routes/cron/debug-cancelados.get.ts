import { agregarCanceladosPorProdutoDia } from '../../utils/agregarVendasCanceladas';
import { lerAbaPlanilha } from '../../utils/googleSheets';

/**
 * DIAGNÓSTICO TEMPORÁRIO (24/09/2026) — investigar por que os itens cancelados de PDV de teste
 * ("DESKTOP-2SJ5JIJ") continuam aparecendo em produção mesmo depois do filtro PDV_REAL em
 * agregarVendasCanceladas.ts. Remover esta rota assim que a causa for confirmada e corrigida.
 * Mesma autenticação do cron normal (CRON_SECRET).
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const autorizacao = getHeader(event, 'authorization') ?? '';
  const tokenRecebido = autorizacao.replace(/^Bearer\s+/i, '').trim();
  if (!config.cronSecret || tokenRecebido !== config.cronSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Não autorizado.' });
  }

  const empresa = config.empresaPralis;
  const colunaInicial = config.planilhaColunaInicial || 'F';

  const todosTipos = await lerAbaPlanilha({
    credenciaisJson: config.googleServiceAccountJson,
    spreadsheetId: config.googleSpreadsheetId,
    aba: 'VENDAS_TIPOS',
    colunaInicial,
  });

  const cocaColaRaw = todosTipos.filter((l) => String(l.PRODUTO ?? '').includes('COCA COLA'));
  const filtradas = agregarCanceladosPorProdutoDia(todosTipos, empresa);
  const cocaColaFiltrada = filtradas.filter((l) => String(l.PRODUTO ?? '').includes('COCA COLA'));

  return {
    totalLinhasBrutas: todosTipos.length,
    empresaConfig: empresa,
    colunaInicialConfig: colunaInicial,
    cocaColaRawCount: cocaColaRaw.length,
    cocaColaRawAmostra: cocaColaRaw.slice(0, 5).map((l) => ({
      TIPO: l.TIPO,
      PDV: l.PDV,
      EMPRESA: l.EMPRESA,
      HASH: l.HASH,
    })),
    totalFiltradas: filtradas.length,
    cocaColaFiltradaCount: cocaColaFiltrada.length,
    cocaColaFiltrada,
  };
});
