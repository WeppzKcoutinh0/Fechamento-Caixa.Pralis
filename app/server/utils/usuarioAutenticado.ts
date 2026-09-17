import { createClient } from '@supabase/supabase-js';

/**
 * Confirma que quem chamou é um usuário de verdade logado no app (sessão Supabase válida) — usada
 * pela rota de sync manual (`vendas/sincronizar.post.ts`), que é disparada do navegador pelo
 * próprio usuário, não pela Vercel (essa usa CRON_SECRET, ver cron/importar-planilha.get.ts).
 * Valida o JWT contra a API do Supabase com a chave `anon` (suficiente pra checar assinatura/
 * validade — não precisa de `service_role` só pra confirmar quem é o usuário).
 *
 * Recebe o header `Authorization` já extraído (não o `H3Event` inteiro) pra não depender do tipo
 * exato de `H3Event` — dois pacotes `h3` diferentes coexistem no projeto (Nitro embutido vs a
 * dependência direta) e são tipos incompatíveis entre si mesmo sendo a "mesma" lib.
 */
export async function exigirUsuarioAutenticado(cabecalhoAutorizacao: string | undefined): Promise<void> {
  const config = useRuntimeConfig();
  const token = (cabecalhoAutorizacao ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Não autenticado.' });
  }

  const cliente = createClient(config.public.supabaseUrl, config.public.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await cliente.auth.getUser(token);
  if (error || !data.user) {
    throw createError({ statusCode: 401, statusMessage: 'Sessão inválida ou expirada.' });
  }
}
