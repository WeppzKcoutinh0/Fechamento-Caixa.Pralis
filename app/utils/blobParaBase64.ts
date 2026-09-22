export function blobParaBase64(blob: Blob): Promise<string> {
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
