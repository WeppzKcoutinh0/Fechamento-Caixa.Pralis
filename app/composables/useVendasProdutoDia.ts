import { ref } from 'vue';
import { useSupabase } from './useSupabase';

export interface VendaProdutoDia {
  id: string;
  produto: string;
  produtoCodigo: string | null;
  quantidade: number;
  valorUnitarioCents: number;
  totalCents: number;
  /** Só preenchido pra itens cancelados (tipo='C') — vendas normais não têm horário, só o dia. */
  horaVenda: string | null;
}

interface LinhaRow {
  id: string;
  produto: string;
  produto_codigo: string | null;
  quantidade: string;
  valor_unitario: string;
  total: string;
  hora_venda: string | null;
}

/**
 * Busca em `vendas_produto_dia` filtrando por `tipo` ('F' finalizada / 'C' cancelada) — compartilhado
 * entre `useVendasProdutoDia` (lista de vendas do dia) e `useVendasCanceladas` (lista de produtos
 * cancelados, pedido do usuário 24/09/2026): mesma tabela, mesma forma de buscar, só o filtro de
 * tipo muda — garante que os dois se comportem exatamente igual (loading/erro/ordenação).
 *
 * Ordenação diferente por tipo (pedido do usuário, 24/09/2026): 'F' é um agregado do dia inteiro
 * por produto (ordenar por valor faz sentido, é um ranking); 'C' é uma lista de eventos
 * individuais (uma linha por transação cancelada) — ordena por horário, como um log cronológico.
 */
export async function buscarVendasProdutoDiaPorTipo(
  data: string,
  tipo: 'F' | 'C',
): Promise<VendaProdutoDia[]> {
  const supabase = useSupabase();
  let query = supabase
    .from('vendas_produto_dia')
    .select('id, produto, produto_codigo, quantidade, valor_unitario, total, hora_venda')
    .eq('data_venda', data)
    .eq('tipo', tipo);
  query =
    tipo === 'C'
      ? query.order('hora_venda', { ascending: true, nullsFirst: false })
      : query.order('total', { ascending: false });
  const { data: linhas, error } = await query;
  if (error) throw error;
  return ((linhas as LinhaRow[] | null) ?? []).map((l) => ({
    id: l.id,
    produto: l.produto,
    produtoCodigo: l.produto_codigo,
    quantidade: Number(l.quantidade),
    valorUnitarioCents: Math.round(Number(l.valor_unitario) * 100),
    totalCents: Math.round(Number(l.total) * 100),
    horaVenda: l.hora_venda,
  }));
}

/**
 * Lista de produtos vendidos no dia, de `vendas_produto_dia` (pedido do usuário, 21/09/2026 —
 * expandir "Vendas" no Relatório Final). Loja inteira, não por caixa — essa tabela não tem
 * coluna de caixa/turno, então não dá pra escopar por operador (mesma limitação documentada em
 * `20260918100900_rls_vendas_por_caixa.sql`). `tipo='F'` de propósito (24/09/2026): itens
 * cancelados (tipo='C') têm a lista própria, ver `useVendasCanceladas.ts`.
 */
export function useVendasProdutoDia() {
  const carregando = ref(false);
  const erro = ref<string | null>(null);
  const produtos = ref<VendaProdutoDia[]>([]);

  async function buscarPorData(data: string): Promise<void> {
    carregando.value = true;
    erro.value = null;
    try {
      produtos.value = await buscarVendasProdutoDiaPorTipo(data, 'F');
    } catch (e) {
      erro.value = e instanceof Error ? e.message : 'Não foi possível buscar os produtos vendidos.';
    } finally {
      carregando.value = false;
    }
  }

  return { carregando, erro, produtos, buscarPorData };
}
