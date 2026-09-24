import { ref } from 'vue';
import { buscarVendasProdutoDiaPorTipo, type VendaProdutoDia } from './useVendasProdutoDia';

export type VendaCancelada = VendaProdutoDia;

/**
 * Produtos cancelados do dia, de `vendas_produto_dia` filtrando `tipo='C'` (pedido do usuário,
 * 24/09/2026 — o robô CREARE/Compliart passou a mandar isso, ver
 * integracoes-scripts/queries/VENDAS_PRODUTOS.sql). Mesma busca de `useVendasProdutoDia.ts`
 * (`buscarVendasProdutoDiaPorTipo`), só filtrando o outro tipo — loja inteira, não por caixa,
 * mesma limitação de sempre (a tabela não tem coluna de caixa/turno).
 */
export function useVendasCanceladas() {
  const carregando = ref(false);
  const erro = ref<string | null>(null);
  const itens = ref<VendaCancelada[]>([]);

  async function buscarPorData(data: string): Promise<void> {
    carregando.value = true;
    erro.value = null;
    try {
      itens.value = await buscarVendasProdutoDiaPorTipo(data, 'C');
    } catch (e) {
      erro.value = e instanceof Error ? e.message : 'Não foi possível buscar os produtos cancelados.';
    } finally {
      carregando.value = false;
    }
  }

  return { carregando, erro, itens, buscarPorData };
}
