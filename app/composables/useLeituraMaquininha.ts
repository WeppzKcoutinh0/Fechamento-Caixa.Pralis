import { useSupabase } from './useSupabase';
import type { FechamentoDraft } from '~/types/fechamento';
import { blobParaBase64 } from '~/utils/blobParaBase64';

type Turno = 'manha' | 'tarde';

interface ResultadoLeitura {
  turno: Turno;
  campos: Partial<FechamentoDraft>;
  confianca: number | null;
  avisos: string[];
}

async function otimizarImagemParaIa(arquivo: Blob): Promise<Blob> {
  const formatoApple = /image\/(heic|heif)/i.test(arquivo.type);
  if (!arquivo.type.startsWith('image/') || (!formatoApple && arquivo.size < 900_000))
    return arquivo;
  if (typeof createImageBitmap !== 'function') return arquivo;

  try {
    const bitmap = await createImageBitmap(arquivo);
    const maiorLado = Math.max(bitmap.width, bitmap.height);
    const escala = Math.min(1, 1600 / maiorLado);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const contexto = canvas.getContext('2d');
    if (!contexto) {
      bitmap.close();
      return arquivo;
    }
    contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const reduzida = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', formatoApple ? 0.9 : 0.82),
    );
    return reduzida && reduzida.size < arquivo.size ? reduzida : arquivo;
  } catch {
    return arquivo;
  }
}

/** Leitura assistida: baixa o anexo respeitando a RLS do usuário e pede apenas um patch revisável. */
export function useLeituraMaquininha() {
  const supabase = useSupabase();

  async function enviarParaLeitura(arquivo: Blob, turno: Turno): Promise<ResultadoLeitura> {
    const imagem = await otimizarImagemParaIa(arquivo);
    const { data: sessao } = await supabase.auth.getSession();
    const token = sessao.session?.access_token;
    if (!token) throw new Error('Sessão expirada — faça login novamente.');

    return await $fetch<ResultadoLeitura>('/ia/ler-relatorio-maquininha', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        turno,
        mimeType: imagem.type || 'image/jpeg',
        imageBase64: await blobParaBase64(imagem),
      },
    });
  }

  async function ler(path: string, turno: Turno): Promise<ResultadoLeitura> {
    const { data: arquivo, error: erroDownload } = await supabase.storage
      .from('anexos')
      .download(path);
    if (erroDownload || !arquivo) throw erroDownload ?? new Error('Foto não encontrada.');
    return enviarParaLeitura(arquivo, turno);
  }

  // Foto acabou de ser tirada mas ainda não foi enviada pro Storage (upload adiado até o
  // primeiro "Salvar", ver CampoFoto.vue) — lê o arquivo direto da memória do navegador,
  // sem depender de já ter sido persistido.
  async function lerArquivo(arquivo: File, turno: Turno): Promise<ResultadoLeitura> {
    return enviarParaLeitura(arquivo, turno);
  }

  return { ler, lerArquivo };
}
