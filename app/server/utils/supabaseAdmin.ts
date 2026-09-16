import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Cliente Supabase com a chave `service_role` — só pode ser importado de dentro de `server/`
 * (Nitro), nunca de código que roda no navegador. Usado exclusivamente pela rota de ingestão de
 * vendas, que precisa ignorar RLS para escrever (a RLS de `vendas`/`itens_venda`/`pagamentos_venda`
 * só permite `select` para `authenticated` — ver supabase/migrations/20260915090100_rls_vendas.sql).
 */
export function useSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const config = useRuntimeConfig();
  const url = config.public.supabaseUrl;
  const serviceRoleKey = config.supabaseServiceRoleKey;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Integração de vendas não configurada: defina NUXT_PUBLIC_SUPABASE_URL e NUXT_SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}
