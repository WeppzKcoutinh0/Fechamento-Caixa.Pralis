import { useSupabase } from './useSupabase';
import type { FechamentoDraft } from '~/types/fechamento';

type Turno = 'manha' | 'tarde';

interface ResultadoLeitura {
  turno: Turno;
  campos: Partial<FechamentoDraft>;
  confianca: number | null;
  avisos: string[];
}

function blobParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = String(leitor.result ?? '');
      const separador = resultado.indexOf(',');
      resolve(separador >= 0 ? resultado.slice(separador + 1) : resultado);
    };
    leitor.onerror = () => reject(leitor.error ?? new Error('Não foi possível ler a imagem.'));
    leitor.readAsDataURL(blob);
  });
}

/** Leitura assistida: baixa o anexo respeitando a RLS do usuário e pede apenas um patch revisável. */
export function useLeituraMaquininha() {
  const supabase = useSupabase();

  async function enviarParaLeitura(arquivo: Blob, turno: Turno): Promise<ResultadoLeitura> {
    const { data: sessao } = await supabase.auth.getSession();
    const token = sessao.session?.access_token;
    if (!token) throw new Error('Sessão expirada — faça login novamente.');

    return await $fetch<ResultadoLeitura>('/ia/ler-relatorio-maquininha', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: {
        turno,
        mimeType: arquivo.type || 'image/jpeg',
        imageBase64: await blobParaBase64(arquivo),
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
