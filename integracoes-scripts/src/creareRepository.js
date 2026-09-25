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
