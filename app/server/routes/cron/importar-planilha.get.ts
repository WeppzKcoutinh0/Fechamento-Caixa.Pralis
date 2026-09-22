import { ErroImportacaoVendas } from '../../utils/importarVendas';
import { sincronizarPlanilhaCreare } from '../../utils/sincronizarPlanilha';

/**
 * Sync automático: lê a MESMA planilha Google Sheets que o `bot_padaria_v3` já preenche (rodando
 * na loja) e grava no Supabase — substitui o `npm run importar-planilha` manual do
 * `integracoes-scripts/` por algo que roda sozinho, agendado pelo `vercel.json` (Cron Jobs), sem
 * depender de alguém lembrar de rodar o comando.
 *
 * Protegida por CRON_SECRET: a Vercel injeta automaticamente `Authorization: Bearer $CRON_SECRET`
 * quando essa env var está configurada no projeto — qualquer outra chamada (sem o header certo)
 * leva 401. Ver https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs.
 *
 * Plano Hobby da Vercel só permite 1 execução/dia por cron — isso já tira a dependência de alguém
 * rodar na mão, mas não é "em tempo real". Ver `server/routes/vendas/sincronizar.post.ts` (sync
 * manual disparado pelo usuário logado, sem esperar o cron) e TASKS.md pra mais contexto.
 *
 * Lógica de leitura/gravação em si mora em `server/utils/sincronizarPlanilha.ts`, reaproveitada
 * também pela rota manual — só a autenticação muda entre as duas.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  const autorizacao = getHeader(event, 'authorization') ?? '';
  const tokenRecebido = autorizacao.replace(/^Bearer\s+/i, '').trim();
  if (!config.cronSecret || tokenRecebido !== config.cronSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Não autorizado.' });
  }

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
    console.error('[cron/importar-planilha] erro inesperado:', erro);
    throw createError({
      statusCode: 500,
      statusMessage: erro instanceof Error ? erro.message : 'Erro interno.',
    });
  }
});
