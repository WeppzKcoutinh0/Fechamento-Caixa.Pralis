import { computed, ref } from 'vue';
import { useSupabase } from './useSupabase';

export interface TransferenciaRecebida {
  caixaOrigem: string;
  valorCents: number;
}

interface LinhaRow {
  caixa_origem: string;
  valor_total_cents: number;
}

/**
 * Transferências entre caixas que OUTRO caixa registrou tendo o meu como destino (pedido do
 * usuário, 21/09/2026 — "quando a menina abrir o caixa 2 já tem que ter lá as transferências
 * automáticas"). Usa a RPC `transferencias_caixa_recebidas` (ver migration
 * `20260921110000_transferencias_recebidas.sql`) em vez de ler `transferencias_caixa` direto —
 * essa tabela é filha de `fechamentos` e a RLS dela só deixa o dono ler o próprio; a RPC devolve
 * só o agregado necessário, sempre a partir do `caixa_padrao` de quem está logado (nunca um
 * parâmetro que o cliente possa manipular pra ver a transferência de outro caixa).
 */
export function useTransferenciasRecebidas() {
  const supabase = useSupabase();
  const carregando = ref(false);
  const erro = ref<string | null>(null);
  const recebidas = ref<TransferenciaRecebida[]>([]);

  const totalCents = computed(() => recebidas.value.reduce((soma, r) => soma + r.valorCents, 0));

  async function buscarPorData(data: string): Promise<void> {
    carregando.value = true;
    erro.value = null;
    try {
      const { data: linhas, error } = await supabase.rpc('transferencias_caixa_recebidas', {
        p_data: data,
      });
      if (error) throw error;
      recebidas.value = ((linhas as LinhaRow[] | null) ?? []).map((l) => ({
        caixaOrigem: l.caixa_origem,
        valorCents: Number(l.valor_total_cents),
      }));
    } catch (e) {
      erro.value =
        e instanceof Error ? e.message : 'Não foi possível buscar transferências recebidas.';
    } finally {
      carregando.value = false;
    }
  }

  return { carregando, erro, recebidas, totalCents, buscarPorData };
}
