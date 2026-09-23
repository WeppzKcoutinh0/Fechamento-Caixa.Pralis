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
  if (!resposta || typeof resposta !== 'object')
    throw new Error('Resposta inválida do provedor de IA.');
  const escolha = (resposta as { choices?: unknown[] }).choices?.[0];
  const conteudo =
    escolha && typeof escolha === 'object'
      ? (escolha as { message?: { content?: unknown } }).message?.content
      : null;
  if (typeof conteudo !== 'string' || !conteudo.trim()) {
    throw new Error('A IA não retornou dados estruturados.');
  }
  return conteudo
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
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
  const status =
    (erro as { response?: { status?: number }; statusCode?: number })?.response?.status ??
    (erro as { statusCode?: number })?.statusCode;
  if (status === 503 || status === 429) return true;
  return ehTimeout(erro);
}

export interface MensagemIa {
  role: 'system' | 'user';
  content:
    | string
    | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
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
  const modeloPrincipal = config.aiVisionModel as string;
  if (!apiKey || !modeloPrincipal) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'Leitura por IA não configurada. Defina NUXT_AI_VISION_API_KEY e NUXT_AI_VISION_MODEL.',
    });
  }

  // Medido direto na API do Gemini em 23/09/2026 (fora do app, pra isolar o problema real): uma
  // extração completa (imagem + detalhamento por bandeira) no modelo configurado
  // (gemini-flash-lite-latest) teve sucesso e levou ~31,6s — ou seja, o modelo NÃO está fora do
  // ar, só está lento. O timeout anterior (18s) estava abortando a chamada ANTES dela terminar,
  // e o fallback pra outro modelo só piorava: testado na hora, gemini-flash-latest,
  // gemini-2.0-flash, gemini-2.5-flash-lite e gemini-3.5-flash-lite estavam TODOS fora do ar
  // (503) ou descontinuados (404) ao mesmo tempo — insistir neles só desperdiçava o orçamento de
  // tempo da função. Por isso: um único modelo (o configurado), com um timeout que de fato cabe
  // o tempo real que ele leva quando funciona, dentro do teto de 60s da função Vercel
  // (nitro.vercel.functions.maxDuration em nuxt.config.ts) — 50s de orçamento, com ~10s de folga
  // pra rede/parsing. Só tenta de novo se a falha anterior foi RÁPIDA (ex.: 503 instantâneo) e
  // ainda sobra tempo útil — reter numa falha que já consumiu o timeout inteiro não teria chance
  // real de terminar antes do teto da função.
  const ORCAMENTO_TOTAL_MS = 50_000;
  const FOLGA_MINIMA_PARA_NOVA_TENTATIVA_MS = 12_000;
  const corpoRequisicaoIa = {
    model: modeloPrincipal,
    temperature: 0,
    // O detalhamento por bandeira/tipo (VISA/MASTER/ELO/MAESTRO, PLUXEE/ALELO/TICKET/VR...) pode
    // ter muitos itens numa nota cheia — 1400 tokens já cortava resposta no meio em relatórios
    // grandes, virando "formato que não pôde ser lido" em vez de um resultado completo.
    max_tokens: 3000,
    response_format: { type: 'json_object' },
    messages: mensagens,
  };

  const inicioTotal = Date.now();
  let resposta: unknown;
  let ultimoErro: unknown;
  for (;;) {
    const restanteMs = ORCAMENTO_TOTAL_MS - (Date.now() - inicioTotal);
    if (restanteMs < 3000) break;
    try {
      resposta = await $fetch<unknown>(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: corpoRequisicaoIa,
        timeout: restanteMs,
      });
      ultimoErro = null;
      break;
    } catch (erro: unknown) {
      ultimoErro = erro;
      if (!ehErroTransitorio(erro)) break;
      const sobraParaNovaTentativa = ORCAMENTO_TOTAL_MS - (Date.now() - inicioTotal);
      if (sobraParaNovaTentativa < FOLGA_MINIMA_PARA_NOVA_TENTATIVA_MS) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (ultimoErro) {
    const mensagem = ehTimeout(ultimoErro)
      ? 'O provedor de IA demorou demais para responder. Tente novamente em alguns instantes.'
      : 'Não foi possível consultar o provedor de IA agora. Tente novamente em instantes.';
    throw createError({ statusCode: 502, statusMessage: mensagem });
  }

  return lerModeloJson<T>(extrairConteudo(resposta));
}

export function validarImagemRecebida(mimeType: unknown, imageBase64: unknown): void {
  if (
    !imageBase64 ||
    typeof imageBase64 !== 'string' ||
    !/^image\/(jpeg|jpg|png|webp)$/i.test(String(mimeType ?? ''))
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Envie uma imagem JPG, PNG ou WEBP.' });
  }
  // Evita receber payloads acidentalmente gigantes na função serverless.
  if (imageBase64.length > 15_000_000) {
    throw createError({ statusCode: 413, statusMessage: 'A imagem excede o limite de 15 MB.' });
  }
}
