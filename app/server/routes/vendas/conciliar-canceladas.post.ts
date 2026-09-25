import { z } from 'zod';
import {
  compararChaveIntegracao,
  extrairChaveIntegracaoDoHeader,
} from '../../utils/integracaoAuth';
import { useSupabaseAdmin } from '../../utils/supabaseAdmin';

const payloadSchema = z.object({
  idsCreare: z.array(z.string().trim().min(1)).max(2000),
});

/**
 * Fluxo oficial CREARE -> robô -> API (regra 12 do usuário, 25/09/2026): conferência específica
 * pra detectar canceladas presentes no CREARE e ausentes no sistema — a conciliação de vendas
 * fechadas (contagem/soma) não cobre isso, porque uma venda cancelada não entra nos totais de
 * qualquer forma. O robô chama isto depois de cada ciclo passando os IDs (crus, sem prefixo) das
 * vendas que ele leu como CANCELADA no CREARE naquele ciclo — devolve quais NÃO existem como
 * CANCELADA no banco (nem sequer FINALIZADA: uma venda ausente por completo também conta como
 * ausente aqui).
 *
 * POST /vendas/conciliar-canceladas
 * Authorization: Bearer <mesma chave de vendas/importar>
 * { "idsCreare": ["501", "502", ...] }
 * -> { "ausentes": ["502", ...] }
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

  const resultado = payloadSchema.safeParse(await readBody(event));
  if (!resultado.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'INTEGRATION_VALIDATION_ERROR',
      data: { erros: resultado.error.issues.map((i) => i.message) },
    });
  }
  const { idsCreare } = resultado.data;
  if (idsCreare.length === 0) return { ausentes: [] };

  const supabase = useSupabaseAdmin();
  const idsCompletos = idsCreare.map((id) => `CREARE:${id}`);
  const { data, error } = await supabase
    .from('vendas')
    .select('id_creare')
    .eq('status', 'CANCELADA')
    .in('id_creare', idsCompletos);
  if (error) {
    throw createError({ statusCode: 503, statusMessage: 'INTEGRATION_DATABASE_ERROR' });
  }

  const presentes = new Set((data ?? []).map((v) => v.id_creare));
  const ausentes = idsCreare.filter((id) => !presentes.has(`CREARE:${id}`));
  return { ausentes };
});
