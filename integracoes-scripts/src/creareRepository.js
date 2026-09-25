// Consulta o CREARE e monta as linhas no MESMO formato que o bot_padaria_v3 já produz
// (services/syncService.js#mapFechamento/mapVendaProduto) — reaproveitado de propósito: é a
// lógica já comprovada em produção, só que sem a normalização pensada pro Google Sheets (aqui os
// valores vão como number/string simples, não em formato de planilha).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2';
import { hashParts } from './hashService.js';
import { interpretarOperador } from './operadorService.js';

const raizProjeto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function carregarQuery(nomeArquivo, dataInicio) {
  const caminho = path.join(raizProjeto, 'queries', nomeArquivo);
  const sql = (await fs.readFile(caminho, 'utf8')).replace(/^﻿/, '');
  return sql.replace(/\{\{VALOR_DATA\}\}/g, mysql.escape(dataInicio));
}

// A query já filtra "DATE(...) >= dataInicio" e agrupa por dia/PDV/operador (ou dia/produto) —
// entao uma unica chamada devolve TODOS os dias desde dataInicio ate hoje, resumidos. Reprocessar
// o mesmo intervalo em ciclos seguintes e seguro: o servidor deduplica por HASH.
export async function buscarFechamentoCaixa(pool, dataInicio) {
  const sql = await carregarQuery('FECHAMENTO_CAIXA.sql', dataInicio);
  const [linhas] = await pool.query(sql);
  return linhas;
}

export async function buscarVendasProdutos(pool, dataInicio) {
  const sql = await carregarQuery('VENDAS_PRODUTOS.sql', dataInicio);
  const [linhas] = await pool.query(sql);
  return linhas;
}

// Fluxo oficial CREARE -> robô -> API (pedido do usuário, 25/09/2026): 3 queries independentes
// (cabeçalho, itens, pagamentos), cada uma retornando 1 linha por (venda[, item/forma]) — SEM
// agregação por dia, diferente de VENDAS_PRODUTOS.sql. Rodam em paralelo (mesmo espírito de
// `sincronizarPlanilha.ts` no app) e são agrupadas por ID_VENDA_BALCAO logo abaixo.
export async function buscarVendas(pool, dataInicio) {
  const [[cabecalhos], [itens], [pagamentos]] = await Promise.all([
    carregarQuery('VENDAS.sql', dataInicio).then((sql) => pool.query(sql)),
    carregarQuery('VENDAS_ITENS.sql', dataInicio).then((sql) => pool.query(sql)),
    carregarQuery('VENDAS_PAGAMENTOS.sql', dataInicio).then((sql) => pool.query(sql)),
  ]);
  return { cabecalhos, itens, pagamentos };
}

/** Agrupa itens/pagamentos (cada um com sua própria linha) por ID_VENDA_BALCAO. */
function agruparPorVenda(linhas) {
  const grupos = new Map();
  for (const linha of linhas) {
    const chave = linha.ID_VENDA_BALCAO;
    const grupo = grupos.get(chave);
    if (grupo) grupo.push(linha);
    else grupos.set(chave, [linha]);
  }
  return grupos;
}

/**
 * Monta uma venda completa (cabeçalho + itens[] + pagamentos[]) pronta pro payload de
 * `POST /vendas/importar` (tipo `venda_creare`) — ver `linhaVendaCreareSchema` no app. ID_VENDA_CREARE
 * sai cru (só o número do CREARE); o app é quem monta o prefixo "CREARE:" final.
 */
export function montarLinhasVendaCreare({ cabecalhos, itens, pagamentos }, { empresa, agora }) {
  const itensPorVenda = agruparPorVenda(itens);
  const pagamentosPorVenda = agruparPorVenda(pagamentos);

  return cabecalhos.map((venda) => ({
    ID_VENDA_CREARE: venda.ID_VENDA_BALCAO === null || venda.ID_VENDA_BALCAO === undefined
      ? null
      : String(venda.ID_VENDA_BALCAO),
    EMPRESA: empresa,
    DATA_VENDA: venda.DATA_VENDA,
    HORA_VENDA: venda.HORA_VENDA,
    PDV: venda.PDV,
    OPERADOR: venda.OPERADOR,
    STATUS: venda.STATUS === 'C' ? 'C' : 'F',
    ITENS: (itensPorVenda.get(venda.ID_VENDA_BALCAO) ?? []).map((item) => ({
      PRODUTO_CODIGO: item.PRODUTO_CODIGO,
      PRODUTO: item.PRODUTO,
      QUANTIDADE: numero(item.QUANTIDADE),
      VALOR_UNITARIO: numero(item.VALOR_UNITARIO),
      TOTAL: numero(item.TOTAL),
    })),
    PAGAMENTOS: (pagamentosPorVenda.get(venda.ID_VENDA_BALCAO) ?? []).map((pagamento) => ({
      FORMA_PAGAMENTO: pagamento.FORMA_PAGAMENTO,
      VALOR: numero(pagamento.VALOR),
    })),
    ATUALIZADO_EM: agora,
  }));
}

function numero(valor) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** DATA_VENDA sai da query como "DD/MM/YYYY" — mantido assim, é o formato que o endpoint entende. */
export function montarLinhaFechamentoCaixa(row, { empresa, agora }) {
  const info = interpretarOperador(row.OPERADOR);
  const record = {
    DATA_VENDA: row.DATA_VENDA,
    PDV: row.PDV,
    OPERADOR: row.OPERADOR,
    // Hora cheia (0-23) da venda — permite filtrar por horário no app (ver FECHAMENTO_CAIXA.sql
    // v6). `null`/ausente = linha antiga sem esse detalhe (turno inteiro, não uma hora).
    HORA: row.HORA === null || row.HORA === undefined ? null : Number(row.HORA),
    PRIMEIRA_VENDA: row.PRIMEIRA_VENDA,
    ULTIMA_VENDA: row.ULTIMA_VENDA,
    NUMERO_VENDAS: numero(row.NUMERO_VENDAS),
    CREDIARIO: numero(row.CREDIARIO),
    CREDITO: numero(row.CREDITO),
    DEBITO: numero(row.DEBITO),
    DINHEIRO: numero(row.DINHEIRO),
    PIX: numero(row.PIX),
    VOUCHER: numero(row.VOUCHER),
    OUTROS: numero(row.OUTROS),
    TOTAL_PAGAMENTO: numero(row.TOTAL_PAGAMENTO),
    CLIENTES: numero(row.CLIENTES),
    COLABORADORES: numero(row.COLABORADORES),
    ALIMENTACAO: numero(row.ALIMENTACAO),
    ROUBO_FURTO: numero(row.ROUBO_FURTO),
    SOCIOS: numero(row.SOCIOS),
    SOBRA_PERDA: numero(row.SOBRA_PERDA),
    EMPRESA: empresa,
    ATUALIZADO_EM: agora,
    CHAVE: [empresa, row.DATA_VENDA, row.PDV, String(row.OPERADOR).trim()].join('|'),
    CAIXA: info.caixa,
    TURNO: info.turno,
    // Sem de-para de operador -> colaborador aqui (isso vinha de uma aba do Google Sheets, que
    // este agente não usa). Fica em branco de propósito — não inventamos o nome da pessoa.
    COLABORADOR: '',
  };

  // MESMAS partes do bot original (services/syncService.js#mapFechamento). Não acrescente campo
  // aqui: mudaria o HASH de tudo que já foi sincronizado e reimportaria a base inteira.
  record.HASH = hashParts([
    'CREARE_COMPILART',
    empresa,
    record.DATA_VENDA,
    record.PDV,
    record.OPERADOR,
    record.PRIMEIRA_VENDA,
    record.ULTIMA_VENDA,
    record.NUMERO_VENDAS,
    record.TOTAL_PAGAMENTO,
  ]);

  return record;
}

export function montarLinhaVendaProduto(row, { empresa, agora }) {
  const record = {
    DATA_VENDA: row.DATA_VENDA,
    PRODUTO_CODIGO: row.PRODUTO_CODIGO,
    PRODUTO: row.PRODUTO,
    QUANTIDADE: numero(row.QUANTIDADE),
    VALOR_UNITARIO: numero(row.VALOR_UNITARIO),
    TOTAL: numero(row.TOTAL),
    // 'F' (finalizada) ou 'C' (cancelada) — vem de VENDAS_PRODUTOS.sql (join com venda_balcao).
    // NÃO entra no HASH abaixo de propósito, ver comentário no .sql.
    TIPO: row.TIPO === 'C' ? 'C' : 'F',
    // 25/09/2026: a query já devolve os IDs de venda do CREARE e as formas de pagamento
    // (GROUP_CONCAT, pode haver mais de uma venda/forma agregada no mesmo produto/dia) — só não
    // entravam aqui, então o app nunca recebia (mesma causa em ambos: rastreabilidade e forma de
    // pagamento sumiam tanto nos produtos vendidos quanto nos cancelados). NÃO entram no HASH:
    // aparecer/mudar não deve forçar reimportar a linha inteira.
    IDS_VENDA_CREARE: row.IDS_VENDA_CREARE ?? null,
    FORMAS_PAGAMENTO: row.FORMAS_PAGAMENTO ?? null,
    EMPRESA: empresa,
    ATUALIZADO_EM: agora,
  };

  record.HASH = hashParts([
    'CREARE_COMPILART',
    empresa,
    record.DATA_VENDA,
    record.PRODUTO_CODIGO,
    record.PRODUTO,
    record.QUANTIDADE,
    record.TOTAL,
  ]);

  return record;
}
