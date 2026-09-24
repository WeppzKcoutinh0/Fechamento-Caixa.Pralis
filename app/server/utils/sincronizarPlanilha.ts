import {
  linhaFechamentoCaixaDiaSchema,
  linhaVendaProdutoDiaSchema,
} from '../../types/vendasFechamento';
import { agregarCanceladosPorProdutoDia } from './agregarVendasCanceladas';
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

// Janela BEM mais curta só pra produtos (21/09/2026, achado real): mesmo com os 14 dias da
// janela acima, VENDAS_PRODUTOS sozinha tem ~850 linhas/dia (11.935 em 14 dias) — muito mais
// densa que FECHAMENTOS_CAIXAS (uma linha por venda/produto, não por turno) — e isso sozinho já
// estourava os 60s da Vercel de novo (medido: 96s rodando os dois juntos). Produtos só precisa
// cobrir o suficiente pra "Vendas" do Relatório Final (que olha só a DATA do próprio fechamento,
// quase sempre hoje/ontem), então uma janela bem mais curta já basta.
const JANELA_DIAS_PRODUTOS = 3;

function filtrarPorEmpresa<T extends { EMPRESA?: string }>(linhas: T[], empresa: string): T[] {
  return linhas.filter((linha) => String(linha.EMPRESA ?? '').trim() === empresa);
}

function filtrarPorJanelaRecente<T extends { DATA_VENDA?: string }>(
  linhas: T[],
  dias: number,
): T[] {
  const corteMs = Date.now() - dias * 24 * 60 * 60 * 1000;
  return linhas.filter((linha) => {
    const dataVenda = parseDataBot(linha.DATA_VENDA);
    if (!dataVenda) return true; // deixa passar — validarDatas() já rejeita formato inválido depois, com o erro certo
    return new Date(`${dataVenda}T00:00:00Z`).getTime() >= corteMs;
  });
}

function loteEmGrupos<T>(linhas: T[]): T[][] {
  const grupos: T[][] = [];
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE)
    grupos.push(linhas.slice(i, i + TAMANHO_LOTE));
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

  // As 3 leituras da planilha são independentes entre si — disparadas em paralelo (25/09/2026,
  // achado real: a 3ª leitura, VENDAS_TIPOS, sequencial depois das outras duas, estourou o
  // timeout de 60s da Vercel). `Promise.all` sobrepõe as 3 idas à rede numa só janela de tempo em
  // vez de somá-las uma atrás da outra.
  const [todasFechamento, todosProdutos, todosTipos] = await Promise.all([
    lerAbaPlanilha({
      credenciaisJson: config.googleServiceAccountJson,
      spreadsheetId: config.googleSpreadsheetId,
      aba: 'FECHAMENTOS_CAIXAS',
      colunaInicial,
    }),
    config.sincronizarProdutos
      ? lerAbaPlanilha({
          credenciaisJson: config.googleServiceAccountJson,
          spreadsheetId: config.googleSpreadsheetIdSecundario || config.googleSpreadsheetId,
          aba: 'VENDAS_PRODUTOS',
          colunaInicial,
        })
      : Promise.resolve([]),
    config.sincronizarProdutos
      ? lerAbaPlanilha({
          credenciaisJson: config.googleServiceAccountJson,
          spreadsheetId: config.googleSpreadsheetId,
          aba: 'VENDAS_TIPOS',
          colunaInicial,
        })
      : Promise.resolve([]),
  ]);

  // As 3 gravações também são independentes entre si (25/09/2026, achado real: mesmo com as
  // leituras em paralelo, a soma das 3 gravações sequenciais ainda estourava os 60s intermitente-
  // mente) — FECHAMENTOS_CAIXAS grava em `vendas_fechamento_caixa_dia` (tabela diferente);
  // VENDAS_PRODUTOS(F) e VENDAS_TIPOS(C) gravam em `vendas_produto_dia`, mas em hashes que nunca
  // colidem entre si (upsert de linhas diferentes, sem disputa de lock real). `Promise.all` roda
  // as 3 ao mesmo tempo em vez de uma atrás da outra.
  async function processarFechamento() {
    const linhasFechamentoBrutas = filtrarPorJanelaRecente(
      filtrarPorEmpresa(todasFechamento, empresa),
      JANELA_DIAS,
    );
    let recebidas = 0;
    let gravadas = 0;
    let invalidas = 0;
    for (const lote of loteEmGrupos(linhasFechamentoBrutas)) {
      const parseadas = lote.map((linha) => linhaFechamentoCaixaDiaSchema.safeParse(linha));
      invalidas += parseadas.filter((p) => !p.success).length;
      const validas = parseadas.filter((p) => p.success).map((p) => p.data);
      if (validas.length === 0) continue;
      const resultado = await processarImportacao('fechamento_caixa_dia', validas);
      recebidas += resultado.recebidas;
      gravadas += resultado.gravadas;
    }
    return { naPlanilha: linhasFechamentoBrutas.length, recebidas, gravadas, invalidas };
  }

  // VENDAS_PRODUTOS religado (21/09/2026): o Relatório Final do wizard passou a mostrar essa
  // lista (ver useVendasProdutoDia.ts) — usa `JANELA_DIAS_PRODUTOS` (bem menor que a de
  // fechamento) por causa da densidade de linhas, ver comentário na constante acima.
  async function processarProdutosFinalizados() {
    if (!config.sincronizarProdutos) return { naPlanilha: 0, recebidas: 0, gravadas: 0, invalidas: 0 };
    const linhasProdutosBrutas = filtrarPorJanelaRecente(
      filtrarPorEmpresa(todosProdutos, empresa),
      JANELA_DIAS_PRODUTOS,
    );
    let recebidas = 0;
    let gravadas = 0;
    let invalidas = 0;
    for (const lote of loteEmGrupos(linhasProdutosBrutas)) {
      const parseadas = lote.map((linha) => linhaVendaProdutoDiaSchema.safeParse(linha));
      invalidas += parseadas.filter((p) => !p.success).length;
      const validas = parseadas.filter((p) => p.success).map((p) => p.data);
      if (validas.length === 0) continue;
      const resultado = await processarImportacao('venda_produto_dia', validas);
      recebidas += resultado.recebidas;
      gravadas += resultado.gravadas;
    }
    return { naPlanilha: linhasProdutosBrutas.length, recebidas, gravadas, invalidas };
  }

  // VENDAS_TIPOS (produtos cancelados, 24/09/2026): aba nova que o robô passou a escrever, uma
  // linha por TRANSAÇÃO cancelada (não pré-agregada como VENDAS_PRODUTOS) — fica na planilha
  // PRIMÁRIA (não tem essa aba na secundária). Só TIPO='CANCELADA' interessa aqui (a aba também
  // tem 'CREDIARIO', assunto de outra tela). Mesma flag/janela de VENDAS_PRODUTOS porque
  // alimenta a mesma pergunta ("Buscar vendas canceladas" no Relatório Final).
  async function processarProdutosCancelados() {
    if (!config.sincronizarProdutos) return { naPlanilha: 0, recebidas: 0, gravadas: 0, invalidas: 0 };
    const canceladosNaJanela = filtrarPorJanelaRecente(
      agregarCanceladosPorProdutoDia(todosTipos, empresa),
      JANELA_DIAS_PRODUTOS,
    );
    let recebidas = 0;
    let gravadas = 0;
    let invalidas = 0;
    for (const lote of loteEmGrupos(canceladosNaJanela)) {
      const parseadas = lote.map((linha) => linhaVendaProdutoDiaSchema.safeParse(linha));
      invalidas += parseadas.filter((p) => !p.success).length;
      const validas = parseadas.filter((p) => p.success).map((p) => p.data);
      if (validas.length === 0) continue;
      const resultado = await processarImportacao('venda_produto_dia', validas, {
        pularLimpezaSnapshots: true,
      });
      recebidas += resultado.recebidas;
      gravadas += resultado.gravadas;
    }
    return { naPlanilha: canceladosNaJanela.length, recebidas, gravadas, invalidas };
  }

  const [fechamento, produtosF, produtosC] = await Promise.all([
    processarFechamento(),
    processarProdutosFinalizados(),
    processarProdutosCancelados(),
  ]);

  return {
    ok: true,
    executadoEm: new Date().toISOString(),
    fechamentoCaixa: fechamento,
    vendasProdutos: {
      naPlanilha: produtosF.naPlanilha + produtosC.naPlanilha,
      recebidas: produtosF.recebidas + produtosC.recebidas,
      gravadas: produtosF.gravadas + produtosC.gravadas,
      invalidas: produtosF.invalidas + produtosC.invalidas,
    },
  };
}
