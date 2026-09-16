import { linhaFechamentoCaixaDiaSchema, linhaVendaProdutoDiaSchema } from '../../../types/vendasFechamento';
import { lerAbaPlanilha } from '../../utils/googleSheets';
import { ErroImportacaoVendas, processarImportacao } from '../../utils/importarVendas';

const TAMANHO_LOTE = 500;

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
 * rodar na mão, mas não é "em tempo real". Ver TASKS.md pra opção de pingar esta rota com mais
 * frequência via um cron externo (cron-job.org etc.) usando o mesmo CRON_SECRET.
 */

function filtrarPorEmpresa<T extends { EMPRESA?: string }>(linhas: T[], empresa: string): T[] {
  return linhas.filter((linha) => String(linha.EMPRESA ?? '').trim() === empresa);
}

function loteEmGrupos<T>(linhas: T[]): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) grupos.push(linhas.slice(i, i + TAMANHO_LOTE));
  return grupos.length > 0 ? grupos : [[]];
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  const autorizacao = getHeader(event, 'authorization') ?? '';
  const tokenRecebido = autorizacao.replace(/^Bearer\s+/i, '').trim();
  if (!config.cronSecret || tokenRecebido !== config.cronSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Não autorizado.' });
  }

  try {
    const empresa = config.empresaPralis;
    const colunaInicial = config.planilhaColunaInicial || 'F';

    const todasFechamento = await lerAbaPlanilha({
      credenciaisJson: config.googleServiceAccountJson,
      spreadsheetId: config.googleSpreadsheetId,
      aba: 'FECHAMENTOS_CAIXAS',
      colunaInicial,
    });
    const linhasFechamentoBrutas = filtrarPorEmpresa(todasFechamento, empresa);
    let fechamentoRecebidas = 0;
    let fechamentoGravadas = 0;
    let fechamentoInvalidas = 0;
    for (const lote of loteEmGrupos(linhasFechamentoBrutas)) {
      const parseadas = lote.map((linha) => linhaFechamentoCaixaDiaSchema.safeParse(linha));
      fechamentoInvalidas += parseadas.filter((p) => !p.success).length;
      const validas = parseadas.filter((p) => p.success).map((p) => p.data);
      if (validas.length === 0) continue;
      const { recebidas, gravadas } = await processarImportacao('fechamento_caixa_dia', validas);
      fechamentoRecebidas += recebidas;
      fechamentoGravadas += gravadas;
    }

    const todosProdutos = await lerAbaPlanilha({
      credenciaisJson: config.googleServiceAccountJson,
      spreadsheetId: config.googleSpreadsheetIdSecundario || config.googleSpreadsheetId,
      aba: 'VENDAS_PRODUTOS',
      colunaInicial,
    });
    const linhasProdutosBrutas = filtrarPorEmpresa(todosProdutos, empresa);
    let produtosRecebidas = 0;
    let produtosGravadas = 0;
    let produtosInvalidas = 0;
    for (const lote of loteEmGrupos(linhasProdutosBrutas)) {
      const parseadas = lote.map((linha) => linhaVendaProdutoDiaSchema.safeParse(linha));
      produtosInvalidas += parseadas.filter((p) => !p.success).length;
      const validas = parseadas.filter((p) => p.success).map((p) => p.data);
      if (validas.length === 0) continue;
      const { recebidas, gravadas } = await processarImportacao('venda_produto_dia', validas);
      produtosRecebidas += recebidas;
      produtosGravadas += gravadas;
    }

    return {
      ok: true,
      executadoEm: new Date().toISOString(),
      fechamentoCaixa: { naPlanilha: linhasFechamentoBrutas.length, recebidas: fechamentoRecebidas, gravadas: fechamentoGravadas, invalidas: fechamentoInvalidas },
      vendasProdutos: { naPlanilha: linhasProdutosBrutas.length, recebidas: produtosRecebidas, gravadas: produtosGravadas, invalidas: produtosInvalidas },
    };
  } catch (erro) {
    if (erro instanceof ErroImportacaoVendas) {
      throw createError({ statusCode: erro.statusCode, statusMessage: erro.message, data: erro.data });
    }
    console.error('[cron/importar-planilha] erro inesperado:', erro);
    throw createError({ statusCode: 500, statusMessage: erro instanceof Error ? erro.message : 'Erro interno.' });
  }
});
