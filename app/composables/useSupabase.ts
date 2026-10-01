import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Token de acesso GARANTIDAMENTE válido, pra montar o header `Authorization` manual que as rotas
 * server/ (IA, exportar planilha, sincronizar vendas, detectar máquina desligada) exigem (pedido
 * do usuário, 01/10/2026: "ler-discriminacao-nota" não tava lendo — achado real nos logs de
 * produção: dezenas de 401 seguidos, não erro de IA nenhum).
 *
 * Causa real: `supabase.auth.getSession()` sozinho só devolve o que já está em memória, confiando
 * no timer interno de auto-refresh do SDK pra manter o token fresco — mas esse timer é baseado em
 * `setTimeout`/`setInterval`, que o navegador pausa quando a aba/PWA fica em segundo plano por
 * muito tempo (mesmo problema já encontrado no plugin de atualização do PWA). Resultado: o
 * operador deixa o app aberto em segundo plano além da validade do token (1h), volta, aperta
 * "Ler com IA" — `getSession()` devolve o token antigo, já expirado, e a rota server rejeita com
 * 401 antes de chegar perto da IA. Força `refreshSession()` quando o token já expirou ou expira
 * nos próximos 30s, em vez de confiar cegamente no timer.
 */
export async function obterTokenValido(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.auth.getSession();
  let sessao = data.session;
  const expiraEmMs = sessao?.expires_at ? sessao.expires_at * 1000 : 0;
  if (!sessao || expiraEmMs < Date.now() + 30_000) {
    const { data: atualizado, error } = await supabase.auth.refreshSession();
    if (error || !atualizado.session) {
      throw new Error('Sessão expirada — faça login novamente.');
    }
    sessao = atualizado.session;
  }
  return sessao.access_token;
}

/**
 * `$fetch` com Authorization automático + 1 nova tentativa se o servidor MESMO ASSIM devolver 401
 * (achado real, 01/10/2026: mesmo com `obterTokenValido` acima, um 401 ainda apareceu em
 * `/exportar-planilha` no meio do fluxo de Salvar — o fechamento inteiro tem várias chamadas
 * autenticadas em sequência, e uma renovação de token no meio do caminho, concorrente com o timer
 * interno do SDK, pode invalidar a renovação de uma das duas corridas — Supabase usa refresh token
 * de uso único). Em vez de tentar prever/evitar a corrida, reage a ela: se o 401 acontecer mesmo
 * assim, força uma renovação de verdade e tenta de novo, só uma vez — e só pra 401 (qualquer outro
 * erro sobe direto, sem mascarar).
 */
export async function fetchAutenticado<T>(
  supabase: SupabaseClient,
  url: string,
  opcoes: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const token = await obterTokenValido(supabase);
  try {
    return await $fetch<T>(url, { ...opcoes, headers: { authorization: `Bearer ${token}` } });
  } catch (erro) {
    const status =
      (erro as { statusCode?: number; status?: number; response?: { status?: number } })
        ?.statusCode ??
      (erro as { status?: number; response?: { status?: number } })?.status ??
      (erro as { response?: { status?: number } })?.response?.status;
    if (status !== 401) throw erro;

    const { data: atualizado, error } = await supabase.auth.refreshSession();
    if (error || !atualizado.session) throw erro;
    return await $fetch<T>(url, {
      ...opcoes,
      headers: { authorization: `Bearer ${atualizado.session.access_token}` },
    });
  }
}

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
