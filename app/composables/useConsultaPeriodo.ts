import { ref } from 'vue';
import { useSupabase } from './useSupabase';
import { calcularJanelaDatetime, extrairLinhas, type FechamentoComItens, type LinhaConsulta, type TipoConsulta } from '~/utils/consultaPeriodo';

interface FechamentoComItensRow {
  id: string;
  codigo: string;
  caixa: string;
  turno: string;
  criado_em: string;
  entradas: { descricao: string; lacre: string; valor: string }[];
  sangrias: { descricao: string; lacre: string; valor: string }[];
  lancamentos: { tipo: string; fornecedor: string; valor: string }[];
}

/**
 * Consulta de entradas/sangrias/lançamentos por data + janela de horário — usa `criado_em` do
 * fechamento (o único horário real que existe; ver `utils/consultaPeriodo.ts`). Usada pelas telas
 * de Entradas/Transferências/Saídas do menu.
 */
export function useConsultaPeriodo() {
  const supabase = useSupabase();
  const carregando = ref(false);
  const erro = ref<string | null>(null);
  const linhas = ref<LinhaConsulta[]>([]);

  async function buscar(params: { data: string; horarioDe: string; horarioAte: string; tipo: TipoConsulta }): Promise<void> {
    if (carregando.value) return;
    carregando.value = true;
    erro.value = null;
    linhas.value = [];

    try {
      const { inicioISO, fimISO } = calcularJanelaDatetime(params.data, params.horarioDe, params.horarioAte);
      const { data, error } = await supabase
        .from('fechamentos')
        .select(
          'id, codigo, caixa, turno, criado_em, entradas(descricao, lacre, valor), sangrias(descricao, lacre, valor), ' +
            'lancamentos(tipo, fornecedor, valor)',
        )
        .gte('criado_em', inicioISO)
        .lte('criado_em', fimISO)
        .order('criado_em');
      if (error) throw error;

      const fechamentos: FechamentoComItens[] = (data as unknown as FechamentoComItensRow[]).map((f) => ({
        id: f.id,
        codigo: f.codigo,
        caixa: f.caixa,
        turno: f.turno,
        criadoEm: f.criado_em,
        entradas: f.entradas.map((e) => ({ descricao: e.descricao, lacre: e.lacre, valorCents: Math.round(Number(e.valor) * 100) })),
        sangrias: f.sangrias.map((s) => ({ descricao: s.descricao, lacre: s.lacre, valorCents: Math.round(Number(s.valor) * 100) })),
        lancamentos: f.lancamentos.map((l) => ({ tipo: l.tipo, fornecedor: l.fornecedor, valorCents: Math.round(Number(l.valor) * 100) })),
      }));

      linhas.value = extrairLinhas(fechamentos, params.tipo);
    } catch {
      erro.value = 'Não foi possível buscar os lançamentos.';
    } finally {
      carregando.value = false;
    }
  }

  return { carregando, erro, linhas, buscar };
}
