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
          .select('id, hora_venda, operador, valor_total')
          .eq('data_venda', data)
          .eq('status', 'FINALIZADA');

        if (error) throw error;

        const vendasBase = (vendas ?? []) as Array<{
          id: string;
          hora_venda: string | null;
          operador: string | null;
          valor_total: number | string;
        }>;
        const idsVendas = vendasBase.map((venda) => venda.id).filter(Boolean);
        const pagamentos: Array<{
          venda_id: string;
          forma_pagamento: string;
          valor: number | string;
        }> = [];
        // Mantém a URL da consulta pequena. Um único `in(...)` com todas as vendas do turno
        // pode ultrapassar o limite do proxy/PostgREST e virar apenas "Failed to fetch".
        for (let inicio = 0; inicio < idsVendas.length; inicio += 75) {
          const loteIds = idsVendas.slice(inicio, inicio + 75);
          const { data: pagamentosLote, error: erroPagamentos } = await supabase
            .from('vendas_pagamentos')
            .select('venda_id, forma_pagamento, valor')
            .in('venda_id', loteIds);
          if (erroPagamentos) throw erroPagamentos;
          pagamentos.push(...((pagamentosLote ?? []) as typeof pagamentos));
        }

        const pagamentosPorVenda = new Map<string, Array<{ forma_pagamento: string; valor: number | string }>>();
        for (const pagamento of pagamentos) {
          const lista = pagamentosPorVenda.get(pagamento.venda_id) ?? [];
          lista.push({ forma_pagamento: pagamento.forma_pagamento, valor: pagamento.valor });
          pagamentosPorVenda.set(pagamento.venda_id, lista);
        }

        const vendasComPagamentos = vendasBase.map((venda) => ({
          ...venda,
          vendas_pagamentos: pagamentosPorVenda.get(venda.id) ?? [],
        }));

        resumo.value = calcularResumoVendasPorHorario(
          data,
          vendasComPagamentos as VendaComPagamentoHorarioRow[],
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
