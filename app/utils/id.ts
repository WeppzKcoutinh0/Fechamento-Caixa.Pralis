/**
 * `crypto.randomUUID()` só existe em "contexto seguro" (HTTPS, ou `localhost`/`127.0.0.1`) —
 * acessando o app por IP de rede local em HTTP puro (ex. `http://192.168.x.x:3001`, usado pra
 * compartilhar o app local enquanto a Vercel/Supabase de produção estavam bloqueadas), o
 * navegador remove essa função inteira e todo `crypto.randomUUID()` quebra com
 * "crypto.randomUUID is not a function" (achado real, 02/10/2026). `crypto.getRandomValues()`,
 * ao contrário, não tem essa restrição — então o fallback usa ela pra montar um UUID v4 na mão.
 */
export function gerarId(): string {
  const webCrypto = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  const bytes = webCrypto?.getRandomValues
    ? webCrypto.getRandomValues(new Uint8Array(16))
    : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
