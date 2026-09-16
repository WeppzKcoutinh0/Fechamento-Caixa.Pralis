import { mapearFechamentoCaixaDia, mapearVendaProdutoDia } from './mapearLinhasBot';
import { useSupabaseAdmin } from './supabaseAdmin';
import type { LinhaFechamentoCaixaDia, LinhaVendaProdutoDia } from '../../types/vendasFechamento';

/**
 * Núcleo de gravação de vendas, extraído de `server/routes/vendas/importar.post.ts` para ser
 * reaproveitado também por `server/routes/cron/importar-planilha.get.ts` (mesmo processo, sem
 * round-trip HTTP): valida datas, mapeia pro formato da tabela e faz upsert por `hash`.
 */

class ErroImportacaoVendas extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public data?: unknown,
  ) {
    super(message);
  }
}

// data_venda null = "DATA_VENDA" não bateu com nenhum formato conhecido (DD/MM/YYYY ou
// YYYY-MM-DD) — payload malformado, não erro transitório: não adianta re-tentar sem corrigir a
// origem.
function validarDatas(linhas: { data_venda: string | null }[]): void {
  const semData = linhas.filter((linha) => linha.data_venda === null);
  if (semData.length > 0) {
    throw new ErroImportacaoVendas('INTEGRATION_VALIDATION_ERROR', 400, {
      erro: `${semData.length} linha(s) com DATA_VENDA em formato não reconhecido.`,
    });
  }
}

// Quando uma linha por HORA chega pro mesmo (empresa, data, pdv, operador) que antes só tinha a
// linha do turno inteiro (hora null — de antes desta revisão, ou vinda da planilha do bot
// original, que não tem hora), a linha antiga fica obsoleta: sem isso, somar "o dia todo" contaria
// o turno inteiro E as horas dele juntos, dobrando o valor. Roda só quando pelo menos uma linha do
// lote já veio com hora (não mexe em nada se o bot original/planilha mandou tudo sem hora, como
// sempre mandou).
async function limparLinhasTurnoSuperadas(
  supabase: ReturnType<typeof useSupabaseAdmin>,
  linhas: { empresa: string; data_venda: string | null; pdv: string; operador: string; hora: number | null }[],
): Promise<void> {
  const chaves = new Map<string, { empresa: string; data_venda: string; pdv: string; operador: string }>();
  for (const linha of linhas) {
    if (linha.hora === null || linha.data_venda === null) continue;
    const chave = `${linha.empresa}|${linha.data_venda}|${linha.pdv}|${linha.operador}`;
    chaves.set(chave, { empresa: linha.empresa, data_venda: linha.data_venda, pdv: linha.pdv, operador: linha.operador });
  }
  for (const { empresa, data_venda, pdv, operador } of chaves.values()) {
    await supabase
      .from('vendas_fechamento_caixa_dia')
      .delete()
      .eq('empresa', empresa)
      .eq('data_venda', data_venda)
      .eq('pdv', pdv)
      .eq('operador', operador)
      .is('hora', null);
  }
}

export async function processarImportacao(
  tipo: 'fechamento_caixa_dia' | 'venda_produto_dia',
  linhasBrutas: LinhaFechamentoCaixaDia[] | LinhaVendaProdutoDia[],
): Promise<{ recebidas: number; gravadas: number }> {
  const supabase = useSupabaseAdmin();

  const resposta =
    tipo === 'fechamento_caixa_dia'
      ? await (async () => {
          const linhas = (linhasBrutas as LinhaFechamentoCaixaDia[]).map(mapearFechamentoCaixaDia);
          validarDatas(linhas);
          const { error, count } = await supabase
            .from('vendas_fechamento_caixa_dia')
            .upsert(linhas, { onConflict: 'hash', count: 'exact' });
          if (!error) await limparLinhasTurnoSuperadas(supabase, linhas);
          return { error, count, recebidas: linhas.length };
        })()
      : await (async () => {
          const linhas = (linhasBrutas as LinhaVendaProdutoDia[]).map(mapearVendaProdutoDia);
          validarDatas(linhas);
          const { error, count } = await supabase
            .from('vendas_produto_dia')
            .upsert(linhas, { onConflict: 'hash', count: 'exact' });
          return { error, count, recebidas: linhas.length };
        })();

  if (resposta.error) {
    throw new ErroImportacaoVendas('INTEGRATION_DATABASE_ERROR', 503, { codigo: resposta.error.code ?? null });
  }

  return { recebidas: resposta.recebidas, gravadas: resposta.count ?? resposta.recebidas };
}

export { ErroImportacaoVendas };
