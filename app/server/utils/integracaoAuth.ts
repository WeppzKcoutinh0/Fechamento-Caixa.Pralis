import { createHash, timingSafeEqual } from 'node:crypto';

function sha256Hex(texto: string): string {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

/**
 * Compara duas chaves por hash + `timingSafeEqual` — nunca compara texto puro, para não vazar por
 * timing quantos caracteres bateram. Pura de propósito (recebe strings já extraídas, não o
 * `H3Event`) para ser testável sem servidor.
 */
export function compararChaveIntegracao(recebida: string, esperada: string): boolean {
  if (!esperada || !recebida.trim()) return false;
  const hashRecebido = Buffer.from(sha256Hex(recebida.trim()), 'hex');
  const hashEsperado = Buffer.from(sha256Hex(esperada), 'hex');
  return timingSafeEqual(hashRecebido, hashEsperado);
}

/** Lê `x-api-key` (ou `Authorization: Bearer <chave>`, formato usado pelo bot) dos headers do request. */
export function extrairChaveIntegracaoDoHeader(headerApiKey: string | null | undefined, headerAuth: string | null | undefined): string {
  const bearer = headerAuth?.startsWith('Bearer ') ? headerAuth.slice('Bearer '.length) : null;
  return headerApiKey ?? bearer ?? '';
}
