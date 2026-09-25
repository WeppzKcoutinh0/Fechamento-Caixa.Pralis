import { ref } from 'vue';
import { useSupabase } from './useSupabase';
import { mensagemDeErro } from '~/utils/erros';

export interface VendaCreareItem {
  id: string;
  produtoCodigo: string | null;
  produto: string;
  quantidade: number;
  valorUnitarioCents: number;
  totalCents: number;
  cancelado: boolean;
}

export interface VendaCreareForma {
  id: string;
  formaPagamento: string;
  valorCents: number;
}

export interface VendaCreare {
  id: string;
  idCreare: string;
  dataVenda: string;
  horaVenda: string | null;
  pdv: string | null;
  operador: string | null;
  status: 'FINALIZADA' | 'CANCELADA';
  totalCents: number;
  itens: VendaCreareItem[];
  pagamentos: VendaCreareForma[];
}

interface ItemRow {
  id: string;
  produto_codigo: string | null;
  produto: string;
  quantidade: string;
  valor_unitario: string;
  total: string;
  cancelado: boolean;
}

interface PagamentoRow {
  id: string;
  forma_pagamento: string;
  valor: string;
}

interface VendaRow {
  id: string;
  id_creare: string;
  data_venda: string;
  hora_venda: string | null;
  pdv: string | null;
  operador: string | null;
  status: 'FINALIZADA' | 'CANCELADA';
  valor_total: string;
  vendas_itens: ItemRow[];
  vendas_pagamentos: PagamentoRow[];
}

const SELECT_VENDA =
  'id, id_creare, data_venda, hora_venda, pdv, operador, status, valor_total, ' +
  'vendas_itens(id, produto_codigo, produto, quantidade, valor_unitario, total, cancelado), ' +
  'vendas_pagamentos(id, forma_pagamento, valor)';

function linhaParaVenda(l: VendaRow): VendaCreare {
  return {
    id: l.id,
    idCreare: l.id_creare,
    dataVenda: l.data_venda,
    horaVenda: l.hora_venda,
    pdv: l.pdv,
    operador: l.operador,
    status: l.status,
    totalCents: Math.round(Number(l.valor_total) * 100),
    itens: (l.vendas_itens ?? []).map((item) => ({
      id: item.id,
      produtoCodigo: item.produto_codigo,
      produto: item.produto,
      quantidade: Number(item.quantidade),
      valorUnitarioCents: Math.round(Number(item.valor_unitario) * 100),
      totalCents: Math.round(Number(item.total) * 100),
      cancelado: item.cancelado,
    })),
    pagamentos: (l.vendas_pagamentos ?? []).map((pagamento) => ({
      id: pagamento.id,
      formaPagamento: pagamento.forma_pagamento,
      valorCents: Math.round(Number(pagamento.valor) * 100),
    })),
  };
}

/**
 * Fluxo oficial CREARE -> robô -> API (pedido do usuário, 25/09/2026): vendas por dia, com itens
 * e pagamentos já aninhados — fonte de verdade nova pra "Vendas canceladas" (`status='CANCELADA'`
 * filtrado no banco), granularidade por VENDA (não mais por produto/dia agregado como
 * `vendas_produto_dia`/`useVendasProdutoDia.ts`, que continua existindo só pra "produtos vendidos
 * no dia").
 */
export async function buscarVendasCrearePorStatus(
  data: string,
  status: 'FINALIZADA' | 'CANCELADA',
): Promise<VendaCreare[]> {
  const supabase = useSupabase();
  const { data: linhas, error } = await supabase
    .from('vendas')
    .select(SELECT_VENDA)
    .eq('data_venda', data)
    .eq('status', status)
    .order('hora_venda', { ascending: true });
  if (error) throw error;
  return ((linhas as unknown as VendaRow[] | null) ?? []).map(linhaParaVenda);
}

export function useVendasCanceladasCreare() {
  const carregando = ref(false);
  const erro = ref<string | null>(null);
  const itens = ref<VendaCreare[]>([]);

  async function buscarPorData(data: string): Promise<void> {
    carregando.value = true;
    erro.value = null;
    try {
      itens.value = await buscarVendasCrearePorStatus(data, 'CANCELADA');
    } catch (e) {
      erro.value = mensagemDeErro(e, 'Não foi possível buscar as vendas canceladas.');
    } finally {
      carregando.value = false;
    }
  }

  return { carregando, erro, itens, buscarPorData };
}
