import { useSupabase } from './useSupabase';
import { blobParaBase64 } from '~/utils/blobParaBase64';

interface ItemLeitura {
  produto: string;
  qtd: number;
  valUnitCents: number;
}

interface ResultadoLeitura {
  fornecedor: string | null;
  itens: ItemLeitura[];
  confianca: number | null;
  avisos: string[];
}

/**
 * Leitura assistida da foto de uma nota/boleto/cupom de despesa ou mercadoria — devolve a lista
 * de itens (produto/qtd/valor unitário) pra discriminação, sempre revisável antes de salvar.
 * Mesmo padrão de useLeituraMaquininha.ts (baixa do Storage OU lê arquivo ainda pendente).
 */
export function useLeituraNotaFiscal() {
  const supabase = useSupabase();

  async function enviarParaLeitura(arquivo: Blob): Promise<ResultadoLeitura> {
    const { data: sessao } = await supabase.auth.getSession();
    const token = sessao.session?.access_token;
    if (!token) throw new Error('Sessão expirada — faça login novamente.');

    return await $fetch<ResultadoLeitura>('/ia/ler-discriminacao-nota', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        mimeType: arquivo.type || 'image/jpeg',
        imageBase64: await blobParaBase64(arquivo),
      },
    });
  }

  async function ler(path: string): Promise<ResultadoLeitura> {
    const { data: arquivo, error: erroDownload } = await supabase.storage
      .from('anexos')
      .download(path);
    if (erroDownload || !arquivo) throw erroDownload ?? new Error('Foto não encontrada.');
    return enviarParaLeitura(arquivo);
  }

  async function lerArquivo(arquivo: File): Promise<ResultadoLeitura> {
    return enviarParaLeitura(arquivo);
  }

  return { ler, lerArquivo };
}
