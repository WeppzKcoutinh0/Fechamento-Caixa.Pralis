import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { useSupabase } from './useSupabase';

const sessionState = () => useState<Session | null>('auth-session', () => null);
const readyState = () => useState<boolean>('auth-ready', () => false);

/**
 * Login único simples (decisão do plano): não existe cadastro público nem permissão por cargo —
 * qualquer conta autenticada tem acesso igual a hoje. Contas são criadas pelo administrador
 * direto no painel do Supabase (Authentication → Users), não por uma tela de cadastro no app.
 */
export function useAuth() {
  const supabase = useSupabase();
  const session = sessionState();
  const ready = readyState();

  async function init() {
    if (ready.value) return;
    const { data } = await supabase.auth.getSession();
    session.value = data.session;
    supabase.auth.onAuthStateChange((_event: AuthChangeEvent, newSession: Session | null) => {
      session.value = newSession;
    });
    ready.value = true;
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    session.value = data.session;
    return data.session;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    session.value = null;
  }

  return {
    session,
    ready,
    isAuthenticated: computed(() => session.value !== null),
    init,
    signIn,
    signOut,
  };
}
