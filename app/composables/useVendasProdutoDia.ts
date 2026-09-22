import { ref } from 'vue';
import { useSupabase } from './useSupabase';

export interface VendaProdutoDia {
  produto: string;
  produtoCodigo: string | null;
  quantidade: number;
  valorUnitarioCents: number;
  totalCents: number;
}

interface LinhaRow {
  produto: string;
  produto_codigo: string | null;
  quantidade: string;
  valor_unitario: string;
  total: string;
}

/**
 * Lista de produtos vendidos no dia, de `vendas_produto_dia` (pedido do usuário, 21/09/2026 —
 * expandir "Vendas" no Relatório Final). Loja inteira, não por caixa — essa tabela não tem
 * coluna de caixa/turno, então não dá pra escopar por operador (mesma limitação documentada em
 * `20260918100900_rls_vendas_por_caixa.sql`).
 */
export function useVendasProdutoDia() {
  const supabase = useSupabase();
  const carregando = ref(false);
  const erro = ref<string | null>(null);
  const produtos = ref<VendaProdutoDia[]>([]);

  async function buscarPorData(data: string): Promise<void> {
    carregando.value = true;
    erro.value = null;
    try {
      const { data: linhas, error } = await supabase
        .from('vendas_produto_dia')
        .select('produto, produto_codigo, quantidade, valor_unitario, total')
        .eq('data_venda', data)
        .order('total', { ascending: false });
      if (error) throw error;
      produtos.value = ((linhas as LinhaRow[] | null) ?? []).map((l) => ({
        produto: l.produto,
        produtoCodigo: l.produto_codigo,
        quantidade: Number(l.quantidade),
        valorUnitarioCents: Math.round(Number(l.valor_unitario) * 100),
        totalCents: Math.round(Number(l.total) * 100),
      }));
    } catch (e) {
      erro.value = e instanceof Error ? e.message : 'Não foi possível buscar os produtos vendidos.';
    } finally {
      carregando.value = false;
    }
  }

  return { carregando, erro, produtos, buscarPorData };
}
