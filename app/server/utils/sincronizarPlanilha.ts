import { linhaFechamentoCaixaDiaSchema, linhaVendaProdutoDiaSchema } from '../../types/vendasFechamento';
import { lerAbaPlanilha } from './googleSheets';
import { processarImportacao } from './importarVendas';
import { parseDataBot } from './parseValoresBot';

const TAMANHO_LOTE = 500;

// Janela de dias recentes (18/09/2026, achado real em produção): a planilha do bot é ACUMULATIVA
// — nunca reescreve/limpa linhas antigas, só cresce (2726 linhas de FECHAMENTOS_CAIXAS num único
// dia de teste; vai crescer todo dia, pra sempre). Reprocessar a planilha INTEIRA em toda
// execução (ler+validar+lote+upsert+dedupe por data) cresce junto — dias antigos já sincronizados
// com sucesso nunca mais mudam, então reprocessá-los de novo e de novo é trabalho 100% jogado
// fora, e foi exatamente isso que estourou o timeout de 60s da Vercel de novo (confirmado: 5
// execuções consecutivas do workflow falharam). Só as datas dos últimos `JANELA_DIAS` dias podem
// ainda estar recebendo snapshots novos do bot — datas mais antigas que isso já se estabilizaram
// há muito tempo e não precisam ser tocadas de novo.
const JANELA_DIAS = 14;

function filtrarPorEmpresa<T extends { EMPRESA?: string }>(linhas: T[], empresa: string): T[] {
  return linhas.filter((linha) => String(linha.EMPRESA ?? '').trim() === empresa);
}

function filtrarPorJanelaRecente<T extends { DATA_VENDA?: string }>(linhas: T[], dias: number): T[] {
  const corteMs = Date.now() - dias * 24 * 60 * 60 * 1000;
  return linhas.filter((linha) => {
    const dataVenda = parseDataBot(linha.DATA_VENDA);
    if (!dataVenda) return true; // deixa passar — validarDatas() já rejeita formato inválido depois, com o erro certo
    return new Date(`${dataVenda}T00:00:00Z`).getTime() >= corteMs;
  });
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
  const linhasFechamentoBrutas = filtrarPorJanelaRecente(filtrarPorEmpresa(todasFechamento, empresa), JANELA_DIAS);
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

  // VENDAS_PRODUTOS desligado por padrão (17/09/2026): a aba não é usada em NENHUM lugar do app
  // ainda (ver TASKS.md, pendência #4) e, desde que o bot passou a escrever a cada ~1min, já
  // acumulou 75 mil+ linhas — ler/validar/gravar tudo isso é o que faz o sync inteiro estourar o
  // limite de execução da Vercel (confirmado: 4min rodando local, bem acima do teto de function
  // da Vercel). Reativa setando NUXT_SINCRONIZAR_PRODUTOS=true quando essa aba passar a ser usada
  // de verdade — aí vale a pena resolver a leitura incremental (só linhas novas, não a planilha
  // inteira) antes de ligar de novo.
  let produtosRecebidas = 0;
  let produtosGravadas = 0;
  let produtosInvalidas = 0;
  let produtosNaPlanilha = 0;
  if (config.sincronizarProdutos) {
    const todosProdutos = await lerAbaPlanilha({
      credenciaisJson: config.googleServiceAccountJson,
      spreadsheetId: config.googleSpreadsheetIdSecundario || config.googleSpreadsheetId,
      aba: 'VENDAS_PRODUTOS',
      colunaInicial,
    });
    const linhasProdutosBrutas = filtrarPorJanelaRecente(filtrarPorEmpresa(todosProdutos, empresa), JANELA_DIAS);
    produtosNaPlanilha = linhasProdutosBrutas.length;
    for (const lote of loteEmGrupos(linhasProdutosBrutas)) {
      const parseadas = lote.map((linha) => linhaVendaProdutoDiaSchema.safeParse(linha));
      produtosInvalidas += parseadas.filter((p) => !p.success).length;
      const validas = parseadas.filter((p) => p.success).map((p) => p.data);
      if (validas.length === 0) continue;
      const { recebidas, gravadas } = await processarImportacao('venda_produto_dia', validas);
      produtosRecebidas += recebidas;
      produtosGravadas += gravadas;
    }
  }

  return {
    ok: true,
    executadoEm: new Date().toISOString(),
    fechamentoCaixa: { naPlanilha: linhasFechamentoBrutas.length, recebidas: fechamentoRecebidas, gravadas: fechamentoGravadas, invalidas: fechamentoInvalidas },
    vendasProdutos: { naPlanilha: produtosNaPlanilha, recebidas: produtosRecebidas, gravadas: produtosGravadas, invalidas: produtosInvalidas },
  };
}
