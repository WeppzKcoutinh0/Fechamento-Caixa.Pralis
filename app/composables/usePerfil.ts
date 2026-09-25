import { useSupabase } from './useSupabase';
import { useAuth } from './useAuth';
import { mensagemDeErro } from '~/utils/erros';

export type Papel = 'admin' | 'caixa';

interface ProfileRow {
  role: Papel;
  nome: string;
  caixa_padrao: string | null;
  turno_padrao: string | null;
}

interface Perfil {
  role: Papel;
  nome: string;
  caixaPadrao: string | null;
  turnoPadrao: string | null;
}

const perfilState = () => useState<Perfil | null>('perfil-usuario', () => null);
const perfilUserIdState = () => useState<string | null>('perfil-usuario-id', () => null);
const carregandoState = () => useState<boolean>('perfil-carregando', () => false);
const erroState = () => useState<string | null>('perfil-erro', () => null);
const requisicaoUserIdState = () =>
  useState<string | null>('perfil-requisicao-user-id', () => null);

/**
 * Fluxo de Caixa (18/09/2026): busca o `profiles` do usuário logado (role admin/caixa, e pra
 * contas operacionais, o caixa/turno padrão delas — ver migration `20260918100000_profiles.sql`).
 * Cacheado em `useState` — busca só uma vez por sessão.
 *
 * Bug real (18/09/2026, reportado pelo usuário): num app SPA (`ssr:false`) trocar de conta
 * (logout + login com outra, sem recarregar a página inteira) mantinha o perfil da conta
 * ANTERIOR em cache — `carregar()` só recarregava quando `session` ficava `null`, nunca quando
 * virava a sessão de OUTRO usuário. Resultado visto ao vivo: logar como `caixa1.manha` depois de
 * ter usado uma conta admin na mesma aba mostrava o painel/menu de admin pra conta caixa. Corrigido
 * guardando de QUEM é o perfil cacheado (`perfilUserId`) e comparando com `session.value.user.id`
 * a cada chamada — se não bate, recarrega, mesmo com `perfil.value` já preenchido.
 */
export function usePerfil() {
  const supabase = useSupabase();
  const { session } = useAuth();
  const perfil = perfilState();
  const perfilUserId = perfilUserIdState();
  const carregando = carregandoState();
  const erro = erroState();
  const requisicaoUserId = requisicaoUserIdState();

  async function carregar(): Promise<void> {
    if (!session.value) {
      perfil.value = null;
      perfilUserId.value = null;
      erro.value = null;
      return;
    }
    const userId = session.value.user.id;
    if (perfil.value && perfilUserId.value === userId) return;
    if (carregando.value && requisicaoUserId.value === userId) return;
    carregando.value = true;
    requisicaoUserId.value = userId;
    erro.value = null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role, nome, caixa_padrao, turno_padrao')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (session.value?.user.id !== userId) return;
      const linha = data as ProfileRow | null;
      perfil.value = linha
        ? {
            role: linha.role,
            nome: linha.nome,
            caixaPadrao: linha.caixa_padrao,
            turnoPadrao: linha.turno_padrao,
          }
        : null;
      perfilUserId.value = session.value.user.id;
    } catch (e) {
      if (session.value?.user.id === userId) {
        perfil.value = null;
        perfilUserId.value = null;
        erro.value = mensagemDeErro(e, 'Não foi possível carregar o perfil do usuário.');
      }
    } finally {
      if (requisicaoUserId.value === userId) {
        requisicaoUserId.value = null;
        carregando.value = false;
      }
    }
  }

  function recarregar(): Promise<void> {
    perfil.value = null;
    perfilUserId.value = null;
    return carregar();
  }

  return {
    perfil,
    carregando,
    erro,
    isAdmin: computed(() => perfil.value?.role === 'admin'),
    carregar,
    recarregar,
  };
}
