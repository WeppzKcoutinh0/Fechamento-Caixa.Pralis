import { z } from 'zod';
import { exigirUsuarioAutenticado } from '../../utils/usuarioAutenticado';
import { useSupabaseAdmin } from '../../utils/supabaseAdmin';

const querySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export default defineEventHandler(async (event) => {
  await exigirUsuarioAutenticado(getHeader(event, 'authorization'));
  const resultado = querySchema.safeParse(getQuery(event));
  if (!resultado.success) {
    throw createError({ statusCode: 400, statusMessage: 'Data de vendas inválida.' });
  }

  const supabase = useSupabaseAdmin();
  const { data, error } = await supabase
    .from('vendas')
    .select('id, hora_venda, operador, pdv, valor_total, vendas_pagamentos(venda_id, forma_pagamento, valor)')
    .eq('data_venda', resultado.data.data)
    .eq('status', 'FINALIZADA');

  if (error) {
    throw createError({ statusCode: 503, statusMessage: 'Não foi possível buscar as vendas.' });
  }
  return data ?? [];
});
