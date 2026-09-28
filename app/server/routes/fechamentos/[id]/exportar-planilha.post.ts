import { exportarFechamentoParaPlanilha } from '../../../utils/exportarFechamentoPlanilha';
import { exigirUsuarioAutenticado } from '../../../utils/usuarioAutenticado';
import { mensagemDeErro } from '../../../../utils/erros';

/**
 * Exporta um fechamento pra planilha do usuário — POST /fechamentos/{id}/exportar-planilha.
 * Chamada automaticamente (melhor esforço) depois de cada Salvar bem-sucedido
 * (WizardFechamento.vue) e disponível como reforço manual (histórico, admin) pro mesmo motivo de
 * sempre: gatilho automático sozinho pode falhar sem avisar ninguém (achado real, 28/09/2026, ver
 * useSincronizarVendas.ts) — o botão manual garante que sempre dá pra tentar de novo.
 */
export default defineEventHandler(async (event) => {
  await exigirUsuarioAutenticado(getHeader(event, 'authorization'));

  const id = getRouterParam(event, 'id');
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID do fechamento ausente.' });

  try {
    const { linha } = await exportarFechamentoParaPlanilha(id);
    return { ok: true, linha };
  } catch (erro) {
    console.error('[fechamentos/exportar-planilha] erro:', erro);
    throw createError({
      statusCode: 500,
      statusMessage: mensagemDeErro(erro, 'Não foi possível exportar para a planilha.'),
    });
  }
});
