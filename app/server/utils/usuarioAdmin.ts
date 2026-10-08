import { createError } from 'h3';
import { useSupabaseAdmin } from './supabaseAdmin';

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

export async function exigirAdministrador(authorization: string | undefined) {
  const token = (authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw createError({ statusCode: 401, statusMessage: 'Não autenticado.' });

  const supabase = useSupabaseAdmin();
  const { data: usuarioAuth, error: erroAuth } = await supabase.auth.getUser(token);
  if (erroAuth || !usuarioAuth.user) {
    throw createError({ statusCode: 401, statusMessage: 'Sessão inválida ou expirada.' });
  }

  const { data: perfil, error: erroPerfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', usuarioAuth.user.id)
    .maybeSingle();
  if (erroPerfil) throw createError({ statusCode: 500, statusMessage: erroPerfil.message });
  if (perfil?.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Apenas administradores podem fazer isso.' });
  }

  return { supabase };
}

export function mapearUsuario(
  authUser: { id: string; email?: string; created_at: string; email_confirmed_at?: string | null },
  perfil: {
    user_id: string;
    role: 'admin' | 'caixa';
    nome: string;
    caixa_padrao: string | null;
    turno_padrao: string | null;
    criado_em: string;
  },
): UsuarioAdmin {
  return {
    id: authUser.id,
    email: authUser.email ?? '',
    nome: perfil.nome,
    role: perfil.role,
    caixaPadrao: perfil.caixa_padrao,
    turnoPadrao: perfil.turno_padrao,
    ativo: true,
    criadoEm: perfil.criado_em || authUser.created_at,
  };
}

export function limparEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function erroAdminComoHttp(error: unknown): never {
  const mensagem = error instanceof Error ? error.message : String(error);
  if (mensagem.includes('profiles_um_usuario_por_caixa_turno')) {
    throw createError({ statusCode: 409, statusMessage: 'Este caixa e turno já possuem um usuário cadastrado.' });
  }
  throw createError({ statusCode: 400, statusMessage: mensagem });
}
