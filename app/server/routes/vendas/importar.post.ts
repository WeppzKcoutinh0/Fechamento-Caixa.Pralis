import { importarVendasPayloadSchema } from '../../../types/vendasFechamento';
import { compararChaveIntegracao, extrairChaveIntegracaoDoHeader } from '../../utils/integracaoAuth';
import { mapearFechamentoCaixaDia, mapearVendaProdutoDia } from '../../utils/mapearLinhasBot';
import { useSupabaseAdmin } from '../../utils/supabaseAdmin';

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
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const chaveRecebida = extrairChaveIntegracaoDoHeader(getHeader(event, 'x-api-key'), getHeader(event, 'authorization'));

  if (!compararChaveIntegracao(chaveRecebida, config.integracaoVendasChave)) {
    throw createError({ statusCode: 401, statusMessage: 'Chave de integração inválida.' });
  }

  const corpoBruto = await readBody(event);
  const resultado = importarVendasPayloadSchema.safeParse(corpoBruto);
  if (!resultado.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'INTEGRATION_VALIDATION_ERROR',
      data: { erros: resultado.error.issues.map((issue) => ({ caminho: issue.path.join('.'), mensagem: issue.message })) },
    });
  }

  const payload = resultado.data;

  // data_venda null = "DATA_VENDA" não bateu com nenhum formato conhecido (DD/MM/YYYY ou
  // YYYY-MM-DD) — payload malformado, não erro transitório: não adianta o bot re-tentar sem
  // corrigir a origem.
  function validarDatas(linhas: { data_venda: string | null }[]): void {
    const semData = linhas.filter((linha) => linha.data_venda === null);
    if (semData.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'INTEGRATION_VALIDATION_ERROR',
        data: { erro: `${semData.length} linha(s) com DATA_VENDA em formato não reconhecido.` },
      });
    }
  }

  // Quando uma linha por HORA chega pro mesmo (empresa, data, pdv, operador) que antes só tinha
  // a linha do turno inteiro (hora null — de antes desta revisão, ou vinda da planilha do bot
  // original, que não tem hora), a linha antiga fica obsoleta: sem isso, somar "o dia todo"
  // contaria o turno inteiro E as horas dele juntos, dobrando o valor. Roda só quando pelo menos
  // uma linha do lote já veio com hora (não mexe em nada se o bot original/planilha mandou tudo
  // sem hora, como sempre mandou).
  async function limparLinhasTurnoSuperadas(
    supabase: ReturnType<typeof useSupabaseAdmin>,
    linhas: { empresa: string; data_venda: string | null; pdv: string; operador: string; hora: number | null }[],
  ): Promise<void> {
    const chaves = new Map<string, { empresa: string; data_venda: string; pdv: string; operador: string }>();
    for (const linha of linhas) {
      if (linha.hora === null || linha.data_venda === null) continue;
      const chave = `${linha.empresa}|${linha.data_venda}|${linha.pdv}|${linha.operador}`;
      chaves.set(chave, { empresa: linha.empresa, data_venda: linha.data_venda, pdv: linha.pdv, operador: linha.operador });
    }
    for (const { empresa, data_venda, pdv, operador } of chaves.values()) {
      await supabase
        .from('vendas_fechamento_caixa_dia')
        .delete()
        .eq('empresa', empresa)
        .eq('data_venda', data_venda)
        .eq('pdv', pdv)
        .eq('operador', operador)
        .is('hora', null);
    }
  }

  try {
    const supabase = useSupabaseAdmin();
    const resposta =
      payload.tipo === 'fechamento_caixa_dia'
        ? await (async () => {
            const linhas = payload.linhas.map(mapearFechamentoCaixaDia);
            validarDatas(linhas);
            const { error, count } = await supabase
              .from('vendas_fechamento_caixa_dia')
              .upsert(linhas, { onConflict: 'hash', count: 'exact' });
            if (!error) await limparLinhasTurnoSuperadas(supabase, linhas);
            return { error, count, recebidas: linhas.length };
          })()
        : await (async () => {
            const linhas = payload.linhas.map(mapearVendaProdutoDia);
            validarDatas(linhas);
            const { error, count } = await supabase
              .from('vendas_produto_dia')
              .upsert(linhas, { onConflict: 'hash', count: 'exact' });
            return { error, count, recebidas: linhas.length };
          })();

    if (resposta.error) {
      throw createError({
        statusCode: 503,
        statusMessage: 'INTEGRATION_DATABASE_ERROR',
        data: { codigo: resposta.error.code ?? null },
      });
    }

    return { ok: true, tipo: payload.tipo, recebidas: resposta.recebidas, gravadas: resposta.count ?? resposta.recebidas };
  } catch (erro) {
    if (erro && typeof erro === 'object' && 'statusCode' in erro) throw erro;
    console.error('[vendas/importar] erro inesperado:', erro);
    throw createError({ statusCode: 500, statusMessage: 'Erro interno.' });
  }
});
