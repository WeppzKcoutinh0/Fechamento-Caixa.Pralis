import { useSupabase } from './useSupabase';

export const FLUXO_CONTAS = ['Conta Cofre', 'Conta Principal'] as const;
export type FluxoConta = (typeof FLUXO_CONTAS)[number];

export interface FluxoLancamento {
  id: string;
  data: string;
  valorCents: number;
  conta: FluxoConta;
  criadoEm: string;
}

interface FluxoLancamentoRow {
  id: string;
  data: string;
  valor: string | number;
  conta: FluxoConta;
  criado_em: string;
}

function toLancamento(row: FluxoLancamentoRow): FluxoLancamento {
  return {
    id: row.id,
    data: row.data,
    valorCents: Math.round(Number(row.valor) * 100),
    conta: row.conta,
    criadoEm: row.criado_em,
  };
}

export function useFluxoLancamentos() {
  const supabase = useSupabase();

  async function listar(): Promise<FluxoLancamento[]> {
    const { data, error } = await supabase
      .from('fluxo_lancamentos')
      .select('id, data, valor, conta, criado_em')
      .order('data', { ascending: false })
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return (data as unknown as FluxoLancamentoRow[]).map(toLancamento);
  }

  async function criar(dados: { data: string; valorCents: number; conta: FluxoConta }): Promise<void> {
    const { error } = await supabase.from('fluxo_lancamentos').insert({
      data: dados.data,
      valor: (dados.valorCents / 100).toFixed(2),
      conta: dados.conta,
    });
    if (error) throw error;
  }

  async function editar(
    id: string,
    dados: { data: string; valorCents: number; conta: FluxoConta },
  ): Promise<void> {
    const { error } = await supabase
      .from('fluxo_lancamentos')
      .update({ data: dados.data, valor: (dados.valorCents / 100).toFixed(2), conta: dados.conta })
      .eq('id', id);
    if (error) throw error;
  }

  return { listar, criar, editar };
}
