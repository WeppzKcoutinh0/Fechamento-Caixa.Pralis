import { useAuth } from './useAuth';

export interface UsuarioAdmin {
  id: string;
  email: string;
  nome: string;
  role: 'admin' | 'caixa';
  caixaPadrao: string | null;
  turnoPadrao: string | null;
  ativo: boolean;
  criadoEm: string;
}

export interface NovoUsuarioAdmin {
  email: string;
  senha: string;
  nome: string;
  role: 'admin' | 'caixa';
  caixaPadrao: string | null;
  turnoPadrao: 'Manhã' | 'Tarde' | null;
}

export function useUsuariosAdmin() {
  const { session } = useAuth();
  function headers() {
    const token = session.value?.access_token;
    if (!token) throw new Error('Sessão administrativa não encontrada.');
    return { Authorization: `Bearer ${token}` };
  }
  async function listar(): Promise<UsuarioAdmin[]> {
    return await $fetch<UsuarioAdmin[]>('/admin/usuarios', { headers: headers() });
  }
  async function criar(dados: NovoUsuarioAdmin): Promise<UsuarioAdmin> {
    return await $fetch<UsuarioAdmin>('/admin/usuarios', { method: 'POST', headers: headers(), body: dados });
  }
  return { listar, criar };
}
