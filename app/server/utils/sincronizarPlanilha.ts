import { linhaFechamentoCaixaDiaSchema, linhaVendaProdutoDiaSchema } from '../../types/vendasFechamento';
import { lerAbaPlanilha } from './googleSheets';
import { processarImportacao } from './importarVendas';

const TAMANHO_LOTE = 500;

function filtrarPorEmpresa<T extends { EMPRESA?: string }>(linhas: T[], empresa: string): T[] {
  return linhas.filter((linha) => String(linha.EMPRESA ?? '').trim() === empresa);
}

function loteEmGrupos<T>(linhas: T[]): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) grupos.push(linhas.slice(i, i + TAMANHO_LOTE));
  return grupos.length > 0 ? grupos : [[]];
}

export interface ResumoSincronizacaoPlanilha {
  ok: true;
  executadoEm: string;
  fechamentoCaixa: { naPlanilha: number; recebidas: number; gravadas: number; invalidas: number };
  vendasProdutos: { naPlanilha: number; recebidas: number; gravadas: number; invalidas: number };
}

/**
 * Núcleo do sync: lê a planilha Google Sheets que o `bot_padaria_v3` já preenche e grava no
 * Supabase — extraído de `server/routes/cron/importar-planilha.get.ts` pra ser reaproveitado
 * também por `server/routes/vendas/sincronizar.post.ts` (sync manual, disparado pelo usuário
 * logado, sem precisar esperar o cron 1x/dia da Vercel).
 *
 * IMPORTANTE — isto NUNCA traz vendas de HOJE se a loja ainda está aberta: o bot original só
 * escreve na planilha 1x/dia, à noite (`HORARIO_EXECUCAO_TNP` no `config.yaml` dele, 22h10 na
 * loja). Rodar esta função de manhã, à tarde, ou quantas vezes quiser, sempre vai reler a MESMA
 * planilha — que só ganha as vendas do dia depois que o bot rodar à noite. Útil pra não esperar
 * até o cron da manhã seguinte (ex.: fechar o caixa hoje à noite, depois do bot rodar, sem
 * esperar até 05h de amanhã) — não é sync em tempo real durante o dia. Isso só existe instalando
 * o agente `integracoes-scripts/sincronizar.js` direto no CREARE da loja (pendência #1 do
 * TASKS.md).
 */
export async function sincronizarPlanilhaCreare(): Promise<ResumoSincronizacaoPlanilha> {
  const config = useRuntimeConfig();
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
}
