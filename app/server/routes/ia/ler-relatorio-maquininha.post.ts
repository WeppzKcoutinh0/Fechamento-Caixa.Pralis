import { exigirUsuarioAutenticado } from '../../utils/usuarioAutenticado';
import {
  centavosPlausiveis,
  chamarProvedorIa,
  listaAvisos,
  numeroOuNulo,
  textoOuNulo,
  validarImagemRecebida,
} from '../../utils/leituraIa';

type TurnoRelatorio = 'manha' | 'tarde';

interface CorpoRequisicao {
  turno?: TurnoRelatorio;
  mimeType?: string;
  imageBase64?: string;
}

interface LeituraModelo {
  numeroMaquininha?: unknown;
  inicial?: unknown;
  final?: unknown;
  credito?: unknown;
  debito?: unknown;
  pix?: unknown;
  voucher?: unknown;
  confianca?: unknown;
  avisos?: unknown;
}

/**
 * Lê uma foto já anexada pelo usuário e devolve somente um preenchimento dos campos existentes
 * em FechamentoDraft. A rota não grava fechamento, não altera totais e não usa service_role para
 * baixar arquivos: o navegador envia a imagem que já conseguiu ler pelo Storage/RLS.
 */
export default defineEventHandler(async (event) => {
  await exigirUsuarioAutenticado(getHeader(event, 'authorization'));

  const corpo = await readBody<CorpoRequisicao>(event);
  if (corpo.turno !== 'manha' && corpo.turno !== 'tarde') {
    throw createError({ statusCode: 400, statusMessage: 'Informe o turno da imagem.' });
  }
  validarImagemRecebida(corpo.mimeType, corpo.imageBase64);

  const modelo = await chamarProvedorIa<LeituraModelo>([
    {
      role: 'system',
      content:
        'Você é um extrator de relatórios de maquininha no Brasil. Leia apenas o que estiver legível na imagem. Nunca invente, estime ou faça conta para preencher um campo ausente — isso é uma regra crítica, não uma sugestão. Valores devem ser números em reais, sem símbolo. Retorne JSON puro com as chaves: numeroMaquininha, inicial, final, credito, debito, pix, voucher, confianca (0 a 1) e avisos (array de strings). Use null quando não houver certeza.\n\nATENÇÃO especial aos campos "inicial" e "final": eles só existem em relatórios que têm uma leitura de contador/totalizador explicitamente rotulada como "INICIAL" ou "FINAL" (ou equivalente). Muitos comprovantes (ex.: "Relatório Resumido" do PagBank, com totais por bandeira) NÃO têm esse campo — nesse caso, "inicial" e "final" DEVEM ser null. NUNCA preencha "inicial" ou "final" com número de série, código de operação/transação, data, hora ou qualquer total de bandeira/pagamento — esses não são a mesma coisa e usar um deles é um erro grave. Na dúvida, é sempre preferível null do que um palpite.\n\nIgnore textos de produtos e mantenha os rótulos de pagamento compatíveis com crédito, débito, pix e voucher.',
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Esta imagem é o relatório do turno ${corpo.turno}. Extraia somente os valores das formas de pagamento e os campos de início/fim visíveis (se e somente se estiverem explicitamente rotulados como tal na imagem). Não confunda total bruto com total líquido, nem número de série/código/data com valor monetário; se houver dúvida, deixe null e explique em avisos.`,
        },
        {
          type: 'image_url',
          image_url: { url: `data:${corpo.mimeType};base64,${corpo.imageBase64}` },
        },
      ],
    },
  ]);

  const avisosExtras: string[] = [];
  const patch = {
    nrMaquininha: textoOuNulo(modelo.numeroMaquininha),
    ...(corpo.turno === 'manha'
      ? {
          manhaInicialCents: centavosPlausiveis(modelo.inicial, 'Manhã Inicial', avisosExtras),
          creditoManhaCents: centavosPlausiveis(modelo.credito, 'Crédito Manhã', avisosExtras),
          debitoManhaCents: centavosPlausiveis(modelo.debito, 'Débito Manhã', avisosExtras),
          pixManhaCents: centavosPlausiveis(modelo.pix, 'Pix Manhã', avisosExtras),
          voucherManhaCents: centavosPlausiveis(modelo.voucher, 'Voucher Manhã', avisosExtras),
        }
      : {
          tardeFinalCents: centavosPlausiveis(modelo.final, 'Tarde Final', avisosExtras),
          creditoTardeCents: centavosPlausiveis(modelo.credito, 'Crédito Tarde', avisosExtras),
          debitoTardeCents: centavosPlausiveis(modelo.debito, 'Débito Tarde', avisosExtras),
          pixTardeCents: centavosPlausiveis(modelo.pix, 'Pix Tarde', avisosExtras),
          voucherTardeCents: centavosPlausiveis(modelo.voucher, 'Voucher Tarde', avisosExtras),
        }),
  };

  const confianca = numeroOuNulo(modelo.confianca);
  return {
    turno: corpo.turno,
    campos: patch,
    confianca: confianca === null ? null : Math.min(1, Math.max(0, confianca)),
    avisos: [...avisosExtras, ...listaAvisos(modelo.avisos)],
  };
});
