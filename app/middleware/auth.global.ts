import { useAuth } from '~/composables/useAuth';

const ROTAS_PUBLICAS = new Set(['/login']);

/**
 * Default-deny: toda rota exige sessão exceto a allowlist acima. `ssr:false`, então isso só
 * roda no client — sem custo de checagem no servidor.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return;

  const { ready, isAuthenticated, init } = useAuth();
  if (!ready.value) await init();

  if (!isAuthenticated.value && !ROTAS_PUBLICAS.has(to.path)) {
    return navigateTo('/login');
  }

  if (isAuthenticated.value && to.path === '/login') {
    return navigateTo('/');
  }
});
