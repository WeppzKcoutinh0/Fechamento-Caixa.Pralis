import { ref } from 'vue';
import { obterTokenValido, useSupabase } from './useSupabase';
import { mensagemDeErro } from '~/utils/erros';

/**
 * Exportação do fechamento pra planilha do usuário (28/09/2026, pedido dele: "eu quero
 * absolutamente tudo na planilha... assim que salvar o fechamento ir direto pra planilha") —
 * chamada automaticamente (melhor esforço) por WizardFechamento.vue depois de salvar, e
 * disponível como reforço manual em qualquer outra tela (ex.: histórico, admin).
 */
export function useExportarFechamentoPlanilha() {
  const exportando = ref(false);
  const erro = ref('');

  async function exportar(fechamentoId: string): Promise<boolean> {
    exportando.value = true;
    erro.value = '';
    try {
      const supabase = useSupabase();
      const token = await obterTokenValido(supabase);

      await $fetch(`/fechamentos/${fechamentoId}/exportar-planilha`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      return true;
    } catch (e) {
      erro.value = mensagemDeErro(e, 'Não foi possível exportar para a planilha.');
      return false;
    } finally {
      exportando.value = false;
    }
  }

  return { exportando, erro, exportar };
}
