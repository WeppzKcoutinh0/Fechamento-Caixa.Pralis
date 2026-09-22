import { exigirUsuarioAutenticado } from '../../utils/usuarioAutenticado';

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

function numeroOuNulo(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor !== 'string') return null;

  const limpo = valor
    .replace(/R\$|\s/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

function centavos(valor: unknown): number | null {
  const numero = numeroOuNulo(valor);
  return numero === null ? null : Math.round(numero * 100);
}

// Guarda de sanidade: já vimos a IA "alucinar" um valor absurdo (ex.: confundir número de série
// ou código do comprovante com um valor monetário) em vez de devolver null como instruído. Um
// valor de turno de padaria acima disso é implausível — melhor descartar e avisar do que deixar
// passar um número claramente errado pro formulário.
const TETO_PLAUSIVEL_CENTAVOS = 200_000_00; // R$ 200.000,00
function centavosPlausiveis(valor: unknown, nomeCampo: string, avisosExtras: string[]): number | null {
  const numero = centavos(valor);
  if (numero !== null && Math.abs(numero) > TETO_PLAUSIVEL_CENTAVOS) {
    avisosExtras.push(
      `Valor de "${nomeCampo}" descartado por parecer implausível (${formatarReais(numero)}) — confira manualmente.`,
    );
    return null;
  }
  return numero;
}
function formatarReais(centavos: number): string {
  return `R$ ${(centavos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  return texto || null;
}

function extrairConteudo(resposta: unknown): string {
  if (!resposta || typeof resposta !== 'object') throw new Error('Resposta inválida do provedor de IA.');
  const escolha = (resposta as { choices?: unknown[] }).choices?.[0];
  const conteudo =
    escolha && typeof escolha === 'object'
      ? (escolha as { message?: { content?: unknown } }).message?.content
      : null;
  if (typeof conteudo !== 'string' || !conteudo.trim()) {
    throw new Error('A IA não retornou dados estruturados.');
  }
  return conteudo.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function lerModelo(texto: string): LeituraModelo {
  try {
    const valor: unknown = JSON.parse(texto);
    if (!valor || typeof valor !== 'object') throw new Error('JSON não é um objeto.');
    return valor as LeituraModelo;
  } catch {
    throw new Error('A IA retornou um formato que não pôde ser lido.');
  }
}

// A forma exata do erro lançado pelo $fetch (nome/status) varia conforme a causa (timeout via
// AbortController, resposta HTTP com erro, falha de rede) — checar só `.name`/`.response.status`
// deixou passar casos reais em teste, então também olhamos o texto da mensagem como reforço.
function textoErro(erro: unknown): string {
  if (erro instanceof Error) return `${erro.name ?? ''} ${erro.message ?? ''}`.toLowerCase();
  return String(erro).toLowerCase();
}
function ehTimeout(erro: unknown): boolean {
  return /timeout|aborted/.test(textoErro(erro));
}
function ehErroTransitorio(erro: unknown): boolean {
  const status = (erro as { response?: { status?: number }; statusCode?: number })?.response?.status
    ?? (erro as { statusCode?: number })?.statusCode;
  if (status === 503 || status === 429) return true;
  return ehTimeout(erro);
}

function listaAvisos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === 'string').slice(0, 10);
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
  if (!corpo.imageBase64 || !/^image\/(jpeg|jpg|png|webp)$/i.test(corpo.mimeType ?? '')) {
    throw createError({ statusCode: 400, statusMessage: 'Envie uma imagem JPG, PNG ou WEBP.' });
  }
  // Evita receber payloads acidentalmente gigantes na função serverless.
  if (corpo.imageBase64.length > 15_000_000) {
    throw createError({ statusCode: 413, statusMessage: 'A imagem excede o limite de 15 MB.' });
  }

  const config = useRuntimeConfig();
  const apiKey = config.aiVisionApiKey as string;
  const baseUrl = String(config.aiVisionBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = config.aiVisionModel as string;
  if (!apiKey || !model) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Leitura por IA não configurada. Defina NUXT_AI_VISION_API_KEY e NUXT_AI_VISION_MODEL.',
    });
  }

  const corpoRequisicaoIa = {
    model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
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
    ],
  };

  // O tier gratuito de modelos Flash/Flash-Lite ocasionalmente responde 503 (sobrecarga
  // momentânea do provedor) ou simplesmente trava a conexão sem nunca responder — sem um
  // timeout explícito, o $fetch fica pendurado pra sempre e a tela nunca mostra erro nenhum.
  // Poucas tentativas com timeout + backoff curto resolvem sem custo extra perceptível.
  const TENTATIVAS = 3;
  const TIMEOUT_MS = 25_000;
  let resposta: unknown;
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    try {
      resposta = await $fetch<unknown>(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: corpoRequisicaoIa,
        timeout: TIMEOUT_MS,
      });
      ultimoErro = null;
      break;
    } catch (erro: unknown) {
      ultimoErro = erro;
      if (!ehErroTransitorio(erro) || tentativa === TENTATIVAS) break;
      await new Promise((resolve) => setTimeout(resolve, 600 * tentativa));
    }
  }
  if (ultimoErro) {
    const mensagem = ehTimeout(ultimoErro)
      ? 'O provedor de IA demorou demais para responder. Tente novamente.'
      : 'Não foi possível consultar o provedor de IA agora. Tente novamente em instantes.';
    throw createError({ statusCode: 502, statusMessage: mensagem });
  }

  const modelo = lerModelo(extrairConteudo(resposta));
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
