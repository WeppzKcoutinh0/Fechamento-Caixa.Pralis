import { ref } from 'vue';
import { useSupabase } from './useSupabase';
import {
  calcularResumoVendasDia,
  calcularResumoVendasPorHorario,
  type FechamentoCaixaDiaRow,
  type VendaComPagamentoHorarioRow,
} from '~/utils/vendasFechamento';
import type { ResumoVendasDia } from '~/types/vendasFechamento';
import { demoResumoVendas, modoDemoLocal } from '~/utils/demoLocal';

/**
 * Leitura das vendas já sincronizadas em `vendas_fechamento_caixa_dia` pelo bot local (ver
 * `integracoes-scripts/README.md`) — nunca fala com o CREARE diretamente, só com o Supabase. Usado
 * pelo botão "Buscar vendas" da Identificação.
 */
export function useVendasFechamento() {
  const supabase = useSupabase();
  const carregando = ref(false);
  const erro = ref<string | null>(null);
  const resumo = ref<ResumoVendasDia | null>(null);

  /**
   * `filtros.caixa`/`filtros.turno` restringem a busca a um caixa/turno específico (ex.: "1"/"M")
   * — sem isso, soma TODOS os caixas do dia, o que não corresponde a UM fechamento (cada caixa
   * fecha separado). `filtros.horaInicio`/`horaFim` (0-23) restringem ainda mais, a um intervalo
   * de horas — só funciona pra linhas sincronizadas com hora (ver `hora` em
   * `vendas_fechamento_caixa_dia`); linhas antigas/da planilha do bot original (sem hora, `hora
   * is null`) ficam de fora automaticamente do filtro por horário, porque somariam o turno
   * inteiro dentro de um intervalo que é só uma fatia dele. `null` em erro ou clique repetido
   * durante uma busca em andamento.
   */
  async function buscarPorData(
    data: string,
    filtros?: {
      caixa?: string | null;
      turno?: string | null;
      horaInicio?: number | null;
      horaFim?: number | null;
    },
  ): Promise<ResumoVendasDia | null> {
    if (carregando.value) return null;

    carregando.value = true;
    erro.value = null;
    resumo.value = null;

    try {
      if (modoDemoLocal()) {
        resumo.value = demoResumoVendas();
        return resumo.value;
      }
      const temFiltroPorHorario = filtros?.horaInicio != null || filtros?.horaFim != null;
      if (temFiltroPorHorario) {
        const { data: vendas, error } = await supabase
          .from('vendas')
          .select('hora_venda, operador, valor_total, vendas_pagamentos(forma_pagamento, valor)')
          .eq('data_venda', data)
          .eq('status', 'FINALIZADA');

        if (error) throw error;

        resumo.value = calcularResumoVendasPorHorario(
          data,
          (vendas ?? []) as VendaComPagamentoHorarioRow[],
          {
            caixa: filtros?.caixa ?? null,
            turno: filtros?.turno ?? null,
            inicioSegundos: filtros?.horaInicio ?? null,
            fimSegundos: filtros?.horaFim ?? null,
          },
        );
        return resumo.value;
      }

      let consulta = supabase
        .from('vendas_fechamento_caixa_dia')
        .select(
          'numero_vendas, credito, debito, dinheiro, pix, voucher, clientes, outros, total_pagamento, colaboradores, alimentacao, roubo_furto, socios, sobra_perda',
        )
        .eq('data_venda', data);
      if (filtros?.caixa) consulta = consulta.eq('caixa', filtros.caixa);
      if (filtros?.turno) consulta = consulta.eq('turno', filtros.turno);

      const { data: linhas, error } = await consulta;

      if (error) throw error;

      resumo.value = calcularResumoVendasDia(data, (linhas ?? []) as FechamentoCaixaDiaRow[]);
      return resumo.value;
    } catch {
      erro.value = 'Não foi possível buscar as vendas.';
      return null;
    } finally {
      carregando.value = false;
    }
  }

  return { carregando, erro, resumo, buscarPorData };
}
