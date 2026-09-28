import { useSupabase } from './useSupabase';
import { caixaParaNumero, turnoParaLetra } from '~/utils/vendasFechamento';
import type { Caixa, EventoMaquinaDesligada, Turno } from '~/types/fechamento';

/**
 * "A máquina desligou" tem que ser um FATO (pedido do usuário, 28/09/2026) — mas o app só roda no
 * CELULAR do operador, sem nenhuma ligação com o computador/PDV físico do caixa, então não há
 * como medir isso diretamente (ver comentário longo em types/fechamento.ts sobre as 2 tentativas
 * anteriores descartadas). O que dá pra fazer: comparar, no MESMO dia e turno, o horário da
 * primeira/última venda REAL deste caixa (já sincronizada do CREARE) contra os outros caixas que
 * também venderam — se este começou bem depois ou parou bem antes dos outros, isso é evidência
 * real de que o PDV dele ficou fora do ar durante esse intervalo.
 *
 * A comparação roda no SERVIDOR (`/vendas/detectar-maquina-desligada`) porque a RLS bloqueia um
 * caixa comum de ler os dados de vendas dos OUTROS caixas (regra de segurança de 18/09/2026) —
 * este composable só chama a rota e traduz o resultado.
 */

export interface ResultadoDeteccaoMaquina {
  eventos: EventoMaquinaDesligada[];
  /** false = não havia outro caixa pra comparar nesse dia/turno — cai pro autodeclarado. */
  temDadosSuficientes: boolean;
}

export function useDeteccaoMaquinaDesligada() {
  const supabase = useSupabase();

  async function detectarPorVendas(
    data: string,
    caixa: Caixa,
    turno: Turno,
  ): Promise<ResultadoDeteccaoMaquina> {
    const numeroCaixa = caixaParaNumero(caixa);
    const letraTurno = turnoParaLetra(turno);
    if (!numeroCaixa || !letraTurno) return { eventos: [], temDadosSuficientes: false };

    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) return { eventos: [], temDadosSuficientes: false };

      const resposta = await $fetch<{
        eventos: { descricao: string; confirmadoPelosDados: true }[];
        temDadosSuficientes: boolean;
      }>('/vendas/detectar-maquina-desligada', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: { data, caixa: numeroCaixa, turno: letraTurno },
      });

      return {
        temDadosSuficientes: resposta.temDadosSuficientes,
        eventos: resposta.eventos.map((e) => ({
          descricao: e.descricao,
          confirmadoPelosDados: true,
          motivos: [],
          outroTexto: '',
        })),
      };
    } catch {
      // Best-effort: se a checagem falhar (rede, servidor fora do ar), não trava o fechamento —
      // só cai pro autodeclarado, igual quando não há dados suficientes pra comparar.
      return { eventos: [], temDadosSuficientes: false };
    }
  }

  return { detectarPorVendas };
}
