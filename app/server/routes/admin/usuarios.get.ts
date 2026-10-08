import { exigirAdministrador, mapearUsuario } from '../../utils/usuarioAdmin';

export default defineEventHandler(async (event) => {
  const { supabase } = await exigirAdministrador(getHeader(event, 'authorization'));
  const [{ data: authData, error: erroAuth }, { data: perfis, error: erroPerfis }] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from('profiles').select('user_id, role, nome, caixa_padrao, turno_padrao, criado_em').order('criado_em', { ascending: false }),
  ]);
  if (erroAuth) throw createError({ statusCode: 500, statusMessage: erroAuth.message });
  if (erroPerfis) throw createError({ statusCode: 500, statusMessage: erroPerfis.message });

  const perfilPorId = new Map((perfis ?? []).map((perfil) => [perfil.user_id, perfil]));
  return (authData.users ?? []).map((usuario) => {
    const perfil = perfilPorId.get(usuario.id);
    return perfil ? mapearUsuario(usuario, perfil) : null;
  }).filter((usuario): usuario is NonNullable<typeof usuario> => usuario !== null);
});
