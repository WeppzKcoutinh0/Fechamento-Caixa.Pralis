import { createHash } from 'node:crypto';
import { parseDataBot, parseNumeroBot } from './parseValoresBot';
import type { LinhaVendaProdutoDia } from '../../types/vendasFechamento';

/**
 * `VENDAS_TIPOS` (aba nova que o robô passou a escrever, 24/09/2026) manda uma linha POR
 * TRANSAÇÃO cancelada (com PDV/OPERADOR/CLIENTE/timestamp), diferente de `VENDAS_PRODUTOS` que já
 * vem pré-agregada por (dia, produto) — o próprio bot soma antes de escrever lá. Agregamos aqui em
 * (data, produto) somando quantidade/total ANTES de entrar no mesmo pipeline de
 * `vendas_produto_dia`: se cada transação virasse sua própria linha, o `limparSnapshotsSuperados`
 * (chave produto_codigo+produto+tipo, ver importarVendas.ts) apagaria todas as cancelações do
 * mesmo produto no mesmo dia menos a última, achando que eram snapshots repetidos da mesma coisa.
 *
 * Só processa TIPO === 'CANCELADA' — a mesma aba também tem linhas 'CREDIARIO' (assunto de
 * crediário, não de cancelamento; pedido do usuário foi mexer só no detalhe de cancelados).
 */
export function agregarCanceladosPorProdutoDia(
  linhasBrutas: Record<string, string>[],
  empresa: string,
): LinhaVendaProdutoDia[] {
  const grupos = new Map<
    string,
    { data: string; produto: string; quantidade: number; total: number; atualizadoEm: string }
  >();

  for (const linha of linhasBrutas) {
    if (String(linha.EMPRESA ?? '').trim() !== empresa) continue;
    if (String(linha.TIPO ?? '').trim().toUpperCase() !== 'CANCELADA') continue;

    const data = parseDataBot(linha.DATA_VENDA_BALCAO);
    const produto = String(linha.PRODUTO ?? '').trim();
    if (!data || !produto) continue;

    const quantidade = parseNumeroBot(linha.QUANTIDADE);
    const total = parseNumeroBot(linha.TOTAL);
    const atualizadoEm = String(linha.ATUALIZADO_EM ?? '').trim();

    const chave = `${data}|${produto}`;
    const existente = grupos.get(chave);
    if (existente) {
      existente.quantidade += quantidade;
      existente.total += total;
      if (atualizadoEm > existente.atualizadoEm) existente.atualizadoEm = atualizadoEm;
    } else {
      grupos.set(chave, { data, produto, quantidade, total, atualizadoEm });
    }
  }

  return [...grupos.values()].map((grupo) => {
    // Hash sintético (não vem da planilha, que só tem HASH por transação) — muda sempre que o
    // agregado muda, pra `limparSnapshotsSuperados` conseguir substituir a versão antiga do dia
    // pela mais nova (mesmo "snapshot cumulativo" que as demais abas do bot já fazem).
    const hash = createHash('sha256')
      .update(`cancelado_produto_dia|${empresa}|${grupo.data}|${grupo.produto}|${grupo.quantidade}|${grupo.total}`)
      .digest('hex');
    return {
      DATA_VENDA: grupo.data,
      PRODUTO_CODIGO: null,
      PRODUTO: grupo.produto,
      QUANTIDADE: String(grupo.quantidade),
      VALOR_UNITARIO: String(grupo.quantidade !== 0 ? grupo.total / grupo.quantidade : grupo.total),
      TOTAL: String(grupo.total),
      TIPO: 'C',
      EMPRESA: empresa,
      ATUALIZADO_EM: grupo.atualizadoEm || null,
      HASH: hash,
    };
  });
}
