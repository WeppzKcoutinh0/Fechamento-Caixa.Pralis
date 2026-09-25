import { ErroImportacaoVendas } from '../../utils/importarVendas';
import { sincronizarPlanilhaCreare } from '../../utils/sincronizarPlanilha';
import { exigirUsuarioAutenticado } from '../../utils/usuarioAutenticado';
import { mensagemDeErro } from '../../../utils/erros';

/**
 * Sync manual: mesmo `sincronizarPlanilhaCreare()` do cron automático (1x/dia), mas disparado na
 * hora pelo próprio usuário logado — pedido dele (17/09/2026): não quer esperar até o cron rodar
 * de manhã, quer poder puxar a planilha na hora que quiser.
 *
 * ATENÇÃO (mesma limitação do cron, só que mais visível aqui porque é sob demanda): isto NUNCA
 * traz vendas de HOJE enquanto a loja ainda está aberta — o bot original só escreve na planilha
 * 1x/dia, à noite (22h10). Rodar esta rota de manhã relê a MESMA planilha de ontem à noite; só
 * traz algo novo depois que o bot rodar de novo. Serve pra não esperar até o cron da manhã
 * seguinte depois que o bot já rodou (ex.: fechar o caixa a noite, logo depois das 22h10) — não é
 * tempo real durante o dia. Ver `server/utils/sincronizarPlanilha.ts` pro comentário completo.
 *
 * Autenticação: usuário logado de verdade (sessão Supabase), não o CRON_SECRET da rota automática
 * — ver `server/utils/usuarioAutenticado.ts`.
 */
export default defineEventHandler(async (event) => {
  await exigirUsuarioAutenticado(getHeader(event, 'authorization'));

  try {
    return await sincronizarPlanilhaCreare();
  } catch (erro) {
    if (erro instanceof ErroImportacaoVendas) {
      throw createError({
        statusCode: erro.statusCode,
        statusMessage: erro.message,
        data: erro.data,
      });
    }
    console.error('[vendas/sincronizar] erro inesperado:', erro);
    throw createError({
      statusCode: 500,
      statusMessage: mensagemDeErro(erro, 'Erro interno.'),
    });
  }
});
