/**
 * Extrai uma mensagem legível de qualquer coisa lançada/retornada como erro.
 *
 * Bug real confirmado ao vivo (25/09/2026): erros do Supabase/PostgREST (`{ code, message,
 * details, hint }`) NÃO são instâncias de `Error` — são objetos simples. Todo `catch (e) { ... e
 * instanceof Error ? e.message : 'mensagem genérica' }` espalhado pela base (mais de duas dezenas
 * de arquivos) caía sempre no fallback genérico pra QUALQUER erro real do banco, escondendo a
 * causa de verdade do usuário (ex.: "Não foi possível salvar a transferência" sem dizer por quê).
 */
export function mensagemDeErro(e: unknown, padrao: string): string {
  if (e instanceof Error) return e.message;
  if (
    typeof e === 'object' &&
    e !== null &&
    'message' in e &&
    typeof (e as { message: unknown }).message === 'string'
  ) {
    return (e as { message: string }).message;
  }
  return padrao;
}
