import { useSupabase } from './useSupabase';
import type { CofreCentral } from './useTransferenciasTesouraria';

export interface CofreSaldoInicial {
  cofre: CofreCentral;
  saldoCents: number;
  dataCorte: string;
  atualizadoEm: string;
}

interface SaldoInicialRow {
  cofre: CofreCentral;
  saldo_cents: number;
  data_corte: string;
  atualizado_em: string;
}

/**
 * "Zerar" o histórico de um cofre central e recomeçar a contar a partir de uma data escolhida,
 * com um saldo de abertura escolhido pelo admin (pedido do usuário, 01/10/2026) — não apaga
 * nenhuma movimentação real, só define um ponto de corte: o saldo do cofre passa a ser
 * `saldoCents + movimentações com data >= dataCorte`, ignorando tudo anterior no CÁLCULO (ver
 * pages/cofres.vue::saldoDe). Sem linha nesta tabela pro cofre = sem corte, conta tudo (mesmo
 * comportamento de hoje, nunca quebra um cofre que nunca precisou disso).
 */
export function useCofreSaldoInicial() {
  const supabase = useSupabase();

  async function listar(): Promise<CofreSaldoInicial[]> {
    const { data, error } = await supabase
      .from('cofre_saldo_inicial')
      .select('cofre, saldo_cents, data_corte, atualizado_em');
    if (error) throw error;
    return (data as unknown as SaldoInicialRow[]).map((r) => ({
      cofre: r.cofre,
      saldoCents: Math.round(Number(r.saldo_cents)),
      dataCorte: r.data_corte,
      atualizadoEm: r.atualizado_em,
    }));
  }

  async function definir(cofre: CofreCentral, saldoCents: number, dataCorte: string): Promise<void> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from('cofre_saldo_inicial').upsert({
      cofre,
      saldo_cents: saldoCents,
      data_corte: dataCorte,
      atualizado_por: user?.id ?? null,
      atualizado_em: new Date().toISOString(),
    });
    if (error) throw error;
  }

  async function remover(cofre: CofreCentral): Promise<void> {
    const { error } = await supabase.from('cofre_saldo_inicial').delete().eq('cofre', cofre);
    if (error) throw error;
  }

  return { listar, definir, remover };
}
