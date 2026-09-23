import { useSupabase } from './useSupabase';

/**
 * Contador real (não fictício) de sessões de caixa com fundo não confirmado ainda sem revisão do
 * admin — usado no badge de `/pendencias` no menu lateral (AppSidebar.vue). `useState`
 * compartilhado pra sidebar e a própria página `/pendencias` ficarem sincronizadas sem prop
 * drilling: a página atualiza a contagem depois de resolver uma pendência, a sidebar lê o mesmo
 * valor sem precisar recarregar.
 */
export function usePendenciasFundoCaixa() {
  const supabase = useSupabase();
  const total = useState<number>('pendencias-fundo-total', () => 0);

  async function atualizarContagem(): Promise<void> {
    const { count, error } = await supabase
      .from('cash_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('fundo_confirmado', false)
      .is('fundo_pendencia_resolvida_em', null);
    if (!error) total.value = count ?? 0;
  }

  return { total, atualizarContagem };
}
