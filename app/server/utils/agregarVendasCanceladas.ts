import { createHash } from 'node:crypto';
import { extrairHoraBot, parseDataBot } from './parseValoresBot';
import type { LinhaVendaProdutoDia } from '../../types/vendasFechamento';

// PDV real de loja segue o padrão "<EMPRESA>-PC-CXPDV-<N>" (confirmado nos dados reais: LI-PC-
// CXPDV-1..3, TNP-PC-CXPDV-1..4) — qualquer coisa fora disso ("DESKTOP-2SJ5JIJ", "SERVIDOR-
// PRALIS", vazio) é uma máquina de desenvolvimento/teste de quem mexeu no robô, não um caixa de
// verdade (achado real, 24/09/2026: 2 "cancelamentos" de Coca-Cola vieram de "DESKTOP-2SJ5JIJ"
// com operador "teste"/"GABRIEL" — o usuário confirmou que não existiram de verdade).
const PDV_REAL = /CXPDV/i;

/**
 * `VENDAS_TIPOS` (aba nova que o robô passou a escrever, 24/09/2026) manda uma linha POR
 * TRANSAÇÃO cancelada (com PDV/OPERADOR/CLIENTE/timestamp), diferente de `VENDAS_PRODUTOS` que já
 * vem pré-agregada por (dia, produto). Aqui NÃO agregamos (pedido do usuário, 24/09/2026: mostrar
 * cada item cancelado com sua própria data/horário, igual o robô já registra) — cada transação vira
 * sua própria linha em `vendas_produto_dia`. Por isso `processarImportacao` é chamada com
 * `pularLimpezaSnapshots: true` pra essas linhas (ver importarVendas.ts): duas cancelações do
 * mesmo produto no mesmo dia são dois eventos DIFERENTES, não snapshots cumulativos um do outro —
 * rodar a limpeza normal apagaria uma achando que era uma versão desatualizada da outra.
 *
 * Só processa TIPO === 'CANCELADA' — a mesma aba também tem linhas 'CREDIARIO' (assunto de
 * crediário, não de cancelamento; pedido do usuário foi mexer só no detalhe de cancelados).
 */
export function agregarCanceladosPorProdutoDia(
  linhasBrutas: Record<string, string>[],
  empresa: string,
): LinhaVendaProdutoDia[] {
  const resultado: LinhaVendaProdutoDia[] = [];

  for (const linha of linhasBrutas) {
    if (String(linha.EMPRESA ?? '').trim() !== empresa) continue;
    if (String(linha.TIPO ?? '').trim().toUpperCase() !== 'CANCELADA') continue;
    if (!PDV_REAL.test(String(linha.PDV ?? ''))) continue;

    const data = parseDataBot(linha.DATA_VENDA_BALCAO);
    const produto = String(linha.PRODUTO ?? '').trim();
    if (!data || !produto) continue;

    const hora = extrairHoraBot(linha.DATA_VENDA_BALCAO);
    // HASH da origem é por transação (confirmado real: duas cancelações do mesmo produto no
    // mesmo dia chegam com hashes diferentes) — usa direto, mesmo princípio de `mapearVendaProdutoDia`
    // pras linhas 'F'. Sem HASH na origem (defensivo, nunca visto na prática): deriva um estável a
    // partir do conteúdo da própria linha, só pra nunca colidir com outra transação por acaso.
    const hashOrigem = String(linha.HASH ?? '').trim();
    const hash =
      hashOrigem ||
      createHash('sha256')
        .update(`cancelado_transacao|${empresa}|${data}|${hora}|${produto}|${linha.PDV ?? ''}|${linha.TOTAL ?? ''}`)
        .digest('hex');

    resultado.push({
      DATA_VENDA: data,
      PRODUTO_CODIGO: null,
      PRODUTO: produto,
      QUANTIDADE: linha.QUANTIDADE ?? '0',
      VALOR_UNITARIO: linha.VALOR_UNITARIO ?? '0',
      TOTAL: linha.TOTAL ?? '0',
      TIPO: 'C',
      // Cru (não o `hora` já extraído acima) — mapearVendaProdutoDia() é quem chama
      // extrairHoraBot() de verdade sobre este campo, mesmo ponto único de parsing que DATA_VENDA
      // já usa (parseDataBot lá, não aqui).
      HORA_VENDA: linha.DATA_VENDA_BALCAO,
      EMPRESA: empresa,
      ATUALIZADO_EM: linha.ATUALIZADO_EM || null,
      HASH: hash,
    });
  }

  return resultado;
}
