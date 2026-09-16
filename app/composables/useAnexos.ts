import { useSupabase } from './useSupabase';

const BUCKET = 'anexos';

/**
 * Upload/leitura de anexos (fotos de PDV/maquininha/lançamento/nota, cupom de crediário, áudio
 * de observação). Hoje esses campos existem na tela e nunca funcionam de verdade — implementação
 * real via Supabase Storage (decisão confirmada no plano), sem inventar nenhum campo novo.
 */
export function useAnexos() {
  const supabase = useSupabase();

  /** Envia um arquivo para `{fechamentoId}/{campo}-{timestamp}.{ext}` e retorna o path salvo. */
  async function enviar(fechamentoId: string, campo: string, arquivo: File): Promise<string> {
    const extensao = arquivo.name.includes('.') ? arquivo.name.split('.').pop() : undefined;
    const nomeArquivo = `${campo}-${Date.now()}${extensao ? `.${extensao}` : ''}`;
    const path = `${fechamentoId}/${nomeArquivo}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, arquivo, {
      contentType: arquivo.type || 'application/octet-stream',
      upsert: false,
    });
    if (error) throw error;

    return path;
  }

  /** Gera uma URL assinada temporária para exibir/baixar um anexo privado. */
  async function urlAssinada(path: string, expiraEmSegundos = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, expiraEmSegundos);
    if (error) throw error;
    return data.signedUrl;
  }

  async function remover(path: string): Promise<void> {
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  }

  return { enviar, urlAssinada, remover };
}
