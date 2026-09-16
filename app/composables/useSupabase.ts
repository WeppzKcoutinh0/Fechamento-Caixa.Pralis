import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Cliente Supabase único do app. Usa só `NUXT_PUBLIC_SUPABASE_URL`/`NUXT_PUBLIC_SUPABASE_ANON_KEY`
 * (chave pública/anon) — nunca `service_role` aqui. Toda regra de acesso vem da RLS do banco.
 */
export function useSupabase(): SupabaseClient {
  if (client) return client;

  const config = useRuntimeConfig();
  const url = config.public.supabaseUrl;
  const anonKey = config.public.supabaseAnonKey;

  if (!url || !anonKey) {
    throw new Error(
      'Supabase não configurado: defina NUXT_PUBLIC_SUPABASE_URL e NUXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}
