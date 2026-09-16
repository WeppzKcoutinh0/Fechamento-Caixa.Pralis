import { describe, expect, it } from 'vitest';
import { compararChaveIntegracao, extrairChaveIntegracaoDoHeader } from './integracaoAuth';

describe('compararChaveIntegracao', () => {
  it('aceita a chave correta', () => {
    expect(compararChaveIntegracao('segredo-123', 'segredo-123')).toBe(true);
  });

  it('rejeita chave errada', () => {
    expect(compararChaveIntegracao('chave-errada', 'segredo-123')).toBe(false);
  });

  it('rejeita quando não há chave recebida ou configurada', () => {
    expect(compararChaveIntegracao('', 'segredo-123')).toBe(false);
    expect(compararChaveIntegracao('segredo-123', '')).toBe(false);
  });
});

describe('extrairChaveIntegracaoDoHeader', () => {
  it('prefere x-api-key quando presente', () => {
    expect(extrairChaveIntegracaoDoHeader('chave-direta', 'Bearer outra')).toBe('chave-direta');
  });

  it('usa Authorization: Bearer <chave> (formato do bot) quando x-api-key ausente', () => {
    expect(extrairChaveIntegracaoDoHeader(null, 'Bearer chave-do-bot')).toBe('chave-do-bot');
  });

  it('devolve string vazia sem nenhum dos dois headers', () => {
    expect(extrairChaveIntegracaoDoHeader(null, null)).toBe('');
    expect(extrairChaveIntegracaoDoHeader(undefined, 'token-sem-bearer')).toBe('');
  });
});
