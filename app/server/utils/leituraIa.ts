// Compartilhado entre as rotas de leitura por IA (maquininha, nota/boleto de lançamento) — mesma
// camada de compatibilidade OpenAI do provedor configurado (NUXT_AI_VISION_*), mesma lógica de
// retry/timeout e mesmos parsers defensivos de valor monetário.

export function numeroOuNulo(valor: unknown): number | null {
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

export function centavos(valor: unknown): number | null {
  const numero = numeroOuNulo(valor);
  return numero === null ? null : Math.round(numero * 100);
}

export function formatarReais(centavosValor: number): string {
  return `R$ ${(centavosValor / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Guarda de sanidade: já vimos a IA "alucinar" um valor absurdo (ex.: confundir número de série
// ou código do comprovante com um valor monetário) em vez de devolver null como instruído. Um
// valor implausível pro contexto (turno de padaria, item de nota) é melhor descartar e avisar do
// que deixar passar um número claramente errado pro formulário.
export function centavosPlausiveis(
  valor: unknown,
  nomeCampo: string,
  avisosExtras: string[],
  tetoCentavos = 200_000_00, // R$ 200.000,00
): number | null {
  const numero = centavos(valor);
  if (numero !== null && Math.abs(numero) > tetoCentavos) {
    avisosExtras.push(
      `Valor de "${nomeCampo}" descartado por parecer implausível (${formatarReais(numero)}) — confira manualmente.`,
    );
    return null;
  }
  return numero;
}

export function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  return texto || null;
}

export function listaAvisos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === 'string').slice(0, 10);
}

export function extrairConteudo(resposta: unknown): string {
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

export function lerModeloJson<T>(texto: string): T {
  try {
    const valor: unknown = JSON.parse(texto);
    if (!valor || typeof valor !== 'object') throw new Error('JSON não é um objeto.');
    return valor as T;
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

export interface MensagemIa {
  role: 'system' | 'user';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

/**
 * Chama o provedor de IA configurado (compatível com OpenAI Chat Completions) com retry +
 * timeout, e devolve o JSON já parseado do conteúdo da resposta. Lança `createError` com
 * mensagem amigável (503 sem config, 502 em falha após as tentativas) — pronto pra rota só
 * mapear os campos específicos dela.
 */
export async function chamarProvedorIa<T>(mensagens: MensagemIa[]): Promise<T> {
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
    messages: mensagens,
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

  return lerModeloJson<T>(extrairConteudo(resposta));
}

export function validarImagemRecebida(mimeType: unknown, imageBase64: unknown): void {
  if (!imageBase64 || typeof imageBase64 !== 'string' || !/^image\/(jpeg|jpg|png|webp)$/i.test(String(mimeType ?? ''))) {
    throw createError({ statusCode: 400, statusMessage: 'Envie uma imagem JPG, PNG ou WEBP.' });
  }
  // Evita receber payloads acidentalmente gigantes na função serverless.
  if (imageBase64.length > 15_000_000) {
    throw createError({ statusCode: 413, statusMessage: 'A imagem excede o limite de 15 MB.' });
  }
}
