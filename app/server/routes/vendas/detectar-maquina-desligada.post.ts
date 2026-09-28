import { z } from 'zod';
import { detectarMaquinaDesligadaPorVendas } from '../../utils/detectarMaquinaDesligada';
import { exigirUsuarioAutenticado } from '../../utils/usuarioAutenticado';
import { mensagemDeErro } from '../../../utils/erros';

const payloadSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  caixa: z.string().regex(/^[1-9]\d*$/, 'Caixa inválido.'),
  turno: z.enum(['M', 'T']),
});

/**
 * "Máquina desligada" tem que ser um FATO (pedido do usuário, 28/09/2026) — compara este caixa
 * contra os outros caixas do mesmo dia/turno, o que exige ler vendas de contas que não são a do
 * operador logado (bloqueado pela RLS de propósito) — por isso é uma rota server-side com
 * service_role, chamada por qualquer usuário autenticado (não é admin-only).
 *
 * POST /vendas/detectar-maquina-desligada { data, caixa, turno } -> { eventos, temDadosSuficientes }
 */
export default defineEventHandler(async (event) => {
  await exigirUsuarioAutenticado(getHeader(event, 'authorization'));

  const resultado = payloadSchema.safeParse(await readBody(event));
  if (!resultado.success) {
    throw createError({
      statusCode: 400,
      statusMessage: resultado.error.issues[0]?.message ?? 'Payload inválido.',
    });
  }

  try {
    return await detectarMaquinaDesligadaPorVendas(
      resultado.data.data,
      resultado.data.caixa,
      resultado.data.turno,
    );
  } catch (erro) {
    console.error('[vendas/detectar-maquina-desligada] erro:', erro);
    throw createError({
      statusCode: 500,
      statusMessage: mensagemDeErro(erro, 'Não foi possível checar a máquina desligada.'),
    });
  }
});
