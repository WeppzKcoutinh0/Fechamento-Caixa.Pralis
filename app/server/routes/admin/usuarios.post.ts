import { z } from 'zod';
import { exigirAdministrador, erroAdminComoHttp, limparEmail, mapearUsuario } from '../../utils/usuarioAdmin';

const schema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.'),
  nome: z.string().trim().min(2, 'Informe o nome do usuário.'),
  role: z.enum(['admin', 'caixa']),
  caixaPadrao: z.string().nullable().optional(),
  turnoPadrao: z.enum(['Manhã', 'Tarde']).nullable().optional(),
});

export default defineEventHandler(async (event) => {
  const { supabase } = await exigirAdministrador(getHeader(event, 'authorization'));
  const entrada = schema.safeParse(await readBody(event));
  if (!entrada.success) throw createError({ statusCode: 422, statusMessage: entrada.error.issues[0]?.message ?? 'Dados inválidos.' });

  const dados = entrada.data;
  const caixaPadrao = dados.role === 'caixa' ? dados.caixaPadrao || null : null;
  const turnoPadrao = dados.role === 'caixa' ? dados.turnoPadrao || null : null;
  if (dados.role === 'caixa' && (!caixaPadrao || !turnoPadrao)) {
    throw createError({ statusCode: 422, statusMessage: 'Selecione o caixa e o turno do operador.' });
  }
  if (caixaPadrao && !['Caixa 1', 'Caixa 2', 'Caixa 3', 'Caixa 4'].includes(caixaPadrao)) {
    throw createError({ statusCode: 422, statusMessage: 'Caixa inválido.' });
  }

  const email = limparEmail(dados.email);
  const { data: authData, error: erroAuth } = await supabase.auth.admin.createUser({ email, password: dados.senha, email_confirm: true });
  if (erroAuth || !authData.user) throw createError({ statusCode: 409, statusMessage: erroAuth?.message ?? 'Não foi possível criar o usuário.' });

  const { data: perfil, error: erroPerfil } = await supabase.from('profiles').insert({
    user_id: authData.user.id,
    role: dados.role,
    nome: dados.nome.trim(),
    caixa_padrao: caixaPadrao,
    turno_padrao: turnoPadrao,
  }).select('user_id, role, nome, caixa_padrao, turno_padrao, criado_em').single();

  if (erroPerfil || !perfil) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    if (erroPerfil) erroAdminComoHttp(erroPerfil);
    throw createError({ statusCode: 500, statusMessage: 'Perfil do usuário não foi criado.' });
  }
  return mapearUsuario(authData.user, perfil);
});
