import { ref } from 'vue';
import { useSupabase } from './useSupabase';
import { mensagemDeErro } from '~/utils/erros';

/**
 * Dispara `/vendas/sincronizar` (mesma planilha que o cron automático da Vercel lê 1x/dia) —
 * extraído pra composable (28/09/2026, bug real em produção) porque o cron simplesmente NÃO
 * disparou por 2 dias seguidos, sem nenhum aviso, e "Buscar vendas" (que só lê o que já estava
 * sincronizado) voltava vazio. Todo lugar que lê vendas sincronizadas (Identificação, Relatórios)
 * agora chama isto ANTES de ler, em vez de depender só do cron ou de o usuário lembrar de clicar
 * num botão de sincronizar separado.
 *
 * Best-effort de propósito: nunca lança — se a sincronização falhar (ex.: Google fora do ar), o
 * erro fica em `erro` como aviso, mas quem chamou ainda deve tentar ler o que já tinha antes, em
 * vez de travar a tela inteira por causa disso.
 */
export function useSincronizarVendas() {
  const sincronizando = ref(false);
  const erro = ref('');
  const resultado = ref<{ gravadasFechamento: number; gravadasProdutos: number } | null>(null);

  async function sincronizar(): Promise<void> {
    sincronizando.value = true;
    erro.value = '';
    resultado.value = null;
    try {
      const supabase = useSupabase();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sessão expirada — faça login de novo.');

      const resposta = await $fetch<{
        fechamentoCaixa: { gravadas: number };
        vendasProdutos: { gravadas: number };
      }>('/vendas/sincronizar', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      resultado.value = {
        gravadasFechamento: resposta.fechamentoCaixa.gravadas,
        gravadasProdutos: resposta.vendasProdutos.gravadas,
      };
    } catch (e) {
      erro.value = mensagemDeErro(e, 'Falha ao sincronizar.');
    } finally {
      sincronizando.value = false;
    }
  }

  return { sincronizando, erro, resultado, sincronizar };
}
