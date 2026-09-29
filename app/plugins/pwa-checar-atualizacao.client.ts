/**
 * Divergência real entre celulares (pedido do usuário, 29/09/2026: "em um celular busca um valor
 * e no outro busca o valor certo") — investigado e reproduzido no código, não nos dados: o
 * @vite-pwa/nuxt só rechecava se existe uma versão nova a cada `periodicSyncForUpdates` (1h,
 * nuxt.config.ts), usando um `setInterval` comum — que o navegador PAUSA quando a aba fica em
 * segundo plano (celular bloqueado/trocou de app), principalmente no Safari/iOS. Um funcionário
 * que abre o app, sai, volta horas depois, pode continuar rodando um JS de horas atrás — inclusive
 * de antes de correções reais já publicadas — enquanto outro celular, aberto mais recentemente,
 * já está na versão nova. A app.vue já mostra o aviso "Uma atualização está disponível" quando
 * `$pwa.needRefresh` fica true (PwaControles.vue) — só faltava checar com mais frequência que
 * 1x/hora-de-uso-contínuo. Isto aqui força a checagem toda vez que o app volta a ficar visível
 * (destravar a tela, trocar de aba/app e voltar) — funciona em qualquer navegador, não depende de
 * nenhuma API de "sincronização em segundo plano" (que o iOS Safari nem suporta).
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('service-worker:registered', ({ registration }) => {
    if (!registration) return;
    const reg = registration;
    function checarAgora(): void {
      if (document.visibilityState !== 'visible') return;
      reg.update().catch(() => {
        // Sem internet ou falha de rede na checagem — sem problema, tenta de novo na próxima vez
        // que o app voltar a ficar visível.
      });
    }
    document.addEventListener('visibilitychange', checarAgora);
    window.addEventListener('focus', checarAgora);
    checarAgora();
  });
});
