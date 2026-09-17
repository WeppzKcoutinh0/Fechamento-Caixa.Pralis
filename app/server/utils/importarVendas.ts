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

// O bot passou a escrever a cada ~1 minuto (17/09/2026) — cada escrita é um SNAPSHOT CUMULATIVO
// do dia inteiro até aquele momento (PRIMEIRA_VENDA/ULTIMA_VENDA/totais mudam a cada minuto), não
// um incremento. Sem isso, cada snapshot vira uma linha NOVA (hash muda porque os campos que
// entram nele mudam) e somar "o dia todo" soma dezenas de snapshots sobrepostos do MESMO total,
// inflando o resultado várias vezes (visto ao vivo: "18.721 vendas / R$250mil" num caixa só numa
// manhã, real era ~250 vendas). Mantém só a linha com `atualizado_em_origem` (fallback
// `criado_em`) mais recente por chave (`colunasChave`) — as outras são fotos mais antigas da
// mesma contagem, substituídas pela mais nova assim que ela chega.
//
// UMA query de SELECT por (empresa, data_venda) — não por chave individual (primeira versão fazia
// isso e tomou timeout na Vercel: um lote com ~270 produtos distintos virava ~270 SELECTs + ~270
// DELETEs sequenciais). Agrupa/decide em memória, um DELETE só por par (empresa, data_venda) com
// todos os ids supérfluos daquele dia de uma vez.
async function limparSnapshotsSuperados(
  supabase: ReturnType<typeof useSupabaseAdmin>,
  tabela: 'vendas_fechamento_caixa_dia' | 'vendas_produto_dia',
  colunasChave: string[],
  linhas: { empresa: string; data_venda: string | null }[],
): Promise<void> {
  const pares = new Map<string, { empresa: string; data_venda: string }>();
  for (const linha of linhas) {
    if (linha.data_venda === null) continue;
    pares.set(`${linha.empresa}|${linha.data_venda}`, { empresa: linha.empresa, data_venda: linha.data_venda });
  }

  for (const { empresa, data_venda } of pares.values()) {
    // `atualizado_em_origem`/`criado_em` existem nas duas tabelas — não usa `ultima_venda` aqui de
    // propósito, ela só existe em `vendas_fechamento_caixa_dia`.
    const { data: existentes } = await supabase
      .from(tabela)
      .select(['id', 'atualizado_em_origem', 'criado_em', ...colunasChave].join(','))
      .eq('empresa', empresa)
      .eq('data_venda', data_venda);
    if (!existentes || existentes.length === 0) continue;

    type Linha = { id: string; atualizado_em_origem: string | null; criado_em: string } & Record<string, unknown>;
    const grupos = new Map<string, Linha[]>();
    for (const linha of existentes as unknown as Linha[]) {
      const chave = colunasChave.map((c) => String(linha[c] ?? '')).join('|');
      const grupo = grupos.get(chave);
      if (grupo) grupo.push(linha);
      else grupos.set(chave, [linha]);
    }

    const idsParaRemover: string[] = [];
    for (const grupo of grupos.values()) {
      if (grupo.length <= 1) continue;
      grupo.sort((a, b) => (b.atualizado_em_origem ?? b.criado_em).localeCompare(a.atualizado_em_origem ?? a.criado_em));
      idsParaRemover.push(...grupo.slice(1).map((l) => l.id));
    }
    if (idsParaRemover.length > 0) {
      await supabase.from(tabela).delete().in('id', idsParaRemover);
    }
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
          if (!error) {
            await limparLinhasTurnoSuperadas(supabase, linhas);
            await limparSnapshotsSuperados(supabase, 'vendas_fechamento_caixa_dia', ['pdv', 'operador', 'hora'], linhas);
          }
          return { error, count, recebidas: linhas.length };
        })()
      : await (async () => {
          const linhas = (linhasBrutas as LinhaVendaProdutoDia[]).map(mapearVendaProdutoDia);
          validarDatas(linhas);
          const { error, count } = await supabase
            .from('vendas_produto_dia')
            .upsert(linhas, { onConflict: 'hash', count: 'exact' });
          if (!error) {
            await limparSnapshotsSuperados(supabase, 'vendas_produto_dia', ['produto_codigo', 'produto'], linhas);
          }
          return { error, count, recebidas: linhas.length };
        })();

  if (resposta.error) {
    throw new ErroImportacaoVendas('INTEGRATION_DATABASE_ERROR', 503, { codigo: resposta.error.code ?? null });
  }

  return { recebidas: resposta.recebidas, gravadas: resposta.count ?? resposta.recebidas };
}

export { ErroImportacaoVendas };
