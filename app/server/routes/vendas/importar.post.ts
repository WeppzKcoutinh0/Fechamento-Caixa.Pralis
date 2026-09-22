import { importarVendasPayloadSchema } from '../../../types/vendasFechamento';
import {
  compararChaveIntegracao,
  extrairChaveIntegracaoDoHeader,
} from '../../utils/integracaoAuth';
import { ErroImportacaoVendas, processarImportacao } from '../../utils/importarVendas';

/**
 * Recebe o que o `bot_padaria_v3` já manda de verdade (ver `integracoes-scripts/` e
 * `services/pralisSalesService.js` do bot original, em `app/PRALIS-INTELIGENTE DESIGNER/bot.rar`):
 *
 *   POST /vendas/importar
 *   Authorization: Bearer <PRALIS_VENDAS_API_TOKEN do bot = NUXT_INTEGRACAO_VENDAS_CHAVE aqui>
 *   { "tipo": "fechamento_caixa_dia" | "venda_produto_dia", "linhas": [ {...}, ... ] }
 *
 * Rota em `server/routes/` (não `server/api/`) de propósito: o bot monta a URL como
 * `${PRALIS_VENDAS_API_URL}/vendas/importar`, sem prefixo `/api`.
 *
 * Idempotência: cada linha já vem com HASH calculado pelo bot; upsert por `hash` — reenviar a
 * mesma linha (replay de pendências, reprocesso de dia) nunca duplica.
 *
 * A gravação em si (validação de data, mapeamento, upsert) mora em `server/utils/importarVendas.ts`
 * — reaproveitada também por `server/routes/cron/importar-planilha.get.ts`, que chama a mesma
 * planilha Google Sheets automaticamente todo dia em vez de depender de alguém rodar
 * `npm run importar-planilha` na mão.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const chaveRecebida = extrairChaveIntegracaoDoHeader(
    getHeader(event, 'x-api-key'),
    getHeader(event, 'authorization'),
  );

  if (!compararChaveIntegracao(chaveRecebida, config.integracaoVendasChave)) {
    throw createError({ statusCode: 401, statusMessage: 'Chave de integração inválida.' });
  }

  const corpoBruto = await readBody(event);
  const resultado = importarVendasPayloadSchema.safeParse(corpoBruto);
  if (!resultado.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'INTEGRATION_VALIDATION_ERROR',
      data: {
        erros: resultado.error.issues.map((issue) => ({
          caminho: issue.path.join('.'),
          mensagem: issue.message,
        })),
      },
    });
  }

  const payload = resultado.data;

  try {
    const { recebidas, gravadas } = await processarImportacao(payload.tipo, payload.linhas);
    return { ok: true, tipo: payload.tipo, recebidas, gravadas };
  } catch (erro) {
    if (erro instanceof ErroImportacaoVendas) {
      throw createError({
        statusCode: erro.statusCode,
        statusMessage: erro.message,
        data: erro.data,
      });
    }
    console.error('[vendas/importar] erro inesperado:', erro);
    throw createError({ statusCode: 500, statusMessage: 'Erro interno.' });
  }
});
