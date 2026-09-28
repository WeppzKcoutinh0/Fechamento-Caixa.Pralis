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
 * 28/09/2026 (pedido do usuário: "buscar vendas"/"vendas canceladas" demorando, botões tem que
 * poder ser apertados separados): antes, CADA botão chamava sincronizarSilenciosamente() de novo
 * do zero, mesmo que outro botão tivesse acabado de sincronizar segundos antes — além de lento
 * (repete a chamada cara pro Google Sheets à toa), os 3 botões (Buscar vendas / Sincronizar agora
 * / Buscar vendas canceladas) compartilhavam o mesmo `sincronizando`, então apertar um deixava os
 * outros dois com cara de "carregando" junto. Correção, module-level (compartilhada entre TODAS
 * as telas que chamam isto, não só dentro de uma):
 *   1. Uma sincronização já em andamento é REAPROVEITADA (a segunda chamada só espera a mesma
 *      promise) em vez de disparar uma segunda requisição em paralelo.
 *   2. Uma sincronização concluída há menos de `TTL_MS` é considerada ainda válida — a chamada
 *      seguinte retorna na hora, sem ir à rede de novo.
 * `sincronizando` continua refletindo só se ESTA chamada está esperando uma sincronização de
 * verdade — quem chama isto deve manter seu PRÓPRIO loading local pro botão em si (ver
 * SecaoIdentificacao.vue), pra cada botão não depender do estado dos outros.
 *
 * Best-effort de propósito: nunca lança — se a sincronização falhar (ex.: Google fora do ar), o
 * erro fica em `erro` como aviso, mas quem chamou ainda deve tentar ler o que já tinha antes, em
 * vez de travar a tela inteira por causa disso.
 */

const TTL_MS = 20_000;
let ultimoSyncEm = 0;
let promiseEmAndamento: Promise<void> | null = null;

export function useSincronizarVendas() {
  const sincronizando = ref(false);
  const erro = ref('');
  const resultado = ref<{ gravadasFechamento: number; gravadasProdutos: number } | null>(null);

  async function executarSincronizacao(): Promise<void> {
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
      ultimoSyncEm = Date.now();
    } catch (e) {
      erro.value = mensagemDeErro(e, 'Falha ao sincronizar.');
    }
  }

  async function sincronizar(): Promise<void> {
    erro.value = '';
    if (promiseEmAndamento) {
      sincronizando.value = true;
      try {
        await promiseEmAndamento;
      } finally {
        sincronizando.value = false;
      }
      return;
    }
    if (Date.now() - ultimoSyncEm < TTL_MS) return;

    sincronizando.value = true;
    resultado.value = null;
    promiseEmAndamento = executarSincronizacao().finally(() => {
      promiseEmAndamento = null;
    });
    try {
      await promiseEmAndamento;
    } finally {
      sincronizando.value = false;
    }
  }

  return { sincronizando, erro, resultado, sincronizar };
}
