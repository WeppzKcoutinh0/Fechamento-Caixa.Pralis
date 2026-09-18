import { usePerfil } from '~/composables/usePerfil';

/**
 * Guarda de página (não-global, usar via `definePageMeta({ middleware: ['admin'] })`) —
 * `historico.vue` é a única rota que precisa disto. `auth.global.ts` já garante sessão antes
 * deste middleware rodar.
 */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return;

  const { perfil, isAdmin, carregar } = usePerfil();
  if (!perfil.value) await carregar();

  if (!isAdmin.value) {
    return navigateTo('/');
  }
});
