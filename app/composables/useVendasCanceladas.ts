import { ref } from 'vue';
import { buscarVendasCrearePorStatus } from './useVendasCreare';
import { buscarVendasProdutoDiaPorTipo } from './useVendasProdutoDia';
import { mensagemDeErro } from '~/utils/erros';

/**
 * Compatível por estrutura com `VendaProdutoDia` (mesmos campos, mesmos nomes) — quem já espera
 * `VendaProdutoDia` (gerarPdfFechamento.ts, gerarPdfVendasCanceladas.ts,
 * whatsappVendasCanceladas.ts) continua funcionando sem mudar nada, só ganha `pdv` a mais.
 */
export interface VendaCancelada {
  id: string;
  vendaCreareId: string | null;
  produtoCodigo: string | null;
  produto: string;
  quantidade: number;
  valorUnitarioCents: number;
  totalCents: number;
  horaVenda: string | null;
  formaPagamento?: string | null;
  /** Novo (fluxo oficial CREARE, 25/09/2026) — de onde a venda cancelada veio. */
  pdv: string | null;
}

/**
 * Produtos cancelados do dia — mescla as DUAS fontes durante a transição pro fluxo oficial
 * CREARE -> robô -> API (25/09/2026):
 *
 * 1. `vendas`/`vendas_itens`/`vendas_pagamentos` (`status='CANCELADA'`) — fonte nova, com ID
 *    real da venda, PDV e formas de pagamento, mas só tem dado depois que o robô rodar numa
 *    máquina com acesso ao CREARE da loja (ver README de `integracoes-scripts/`).
 * 2. `vendas_produto_dia` (`tipo='C'`, pipeline antigo via planilha) — continua funcionando
 *    hoje (achado real, 25/09/2026: mostrava cancelamentos reais enquanto a fonte nova ainda
 *    estava vazia). Trocar pra fonte nova ANTES dela ter dado de verdade fazia cancelamentos
 *    reais sumirem da tela — corrigido mostrando as duas juntas até a fonte nova assumir sozinha.
 *
 * Sem `pdv` na fonte antiga (a tabela nunca teve essa coluna) — fica `null` nesses itens.
 */
export function useVendasCanceladas() {
  const carregando = ref(false);
  const erro = ref<string | null>(null);
  const itens = ref<VendaCancelada[]>([]);

  async function buscarPorData(data: string): Promise<void> {
    carregando.value = true;
    erro.value = null;
    try {
      const [vendasNovas, itensAntigos] = await Promise.all([
        buscarVendasCrearePorStatus(data, 'CANCELADA'),
        buscarVendasProdutoDiaPorTipo(data, 'C'),
      ]);
      const doNovo = vendasNovas.flatMap((venda) => {
        const formaPagamento =
          venda.pagamentos.length > 0
            ? venda.pagamentos.map((p) => p.formaPagamento).join(', ')
            : null;
        return venda.itens.map((item) => ({
          id: item.id,
          vendaCreareId: venda.idCreare,
          produtoCodigo: item.produtoCodigo,
          produto: item.produto,
          quantidade: item.quantidade,
          valorUnitarioCents: item.valorUnitarioCents,
          totalCents: item.totalCents,
          horaVenda: venda.horaVenda,
          formaPagamento,
          pdv: venda.pdv,
        }));
      });
      const doAntigo = itensAntigos.map((item) => ({ ...item, pdv: null }));
      itens.value = [...doNovo, ...doAntigo].sort((a, b) =>
        (a.horaVenda ?? '').localeCompare(b.horaVenda ?? ''),
      );
    } catch (e) {
      erro.value = mensagemDeErro(e, 'Não foi possível buscar os produtos cancelados.');
    } finally {
      carregando.value = false;
    }
  }

  return { carregando, erro, itens, buscarPorData };
}
