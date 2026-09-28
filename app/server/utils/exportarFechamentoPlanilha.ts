import { useSupabaseAdmin } from './supabaseAdmin';
import {
  anexarLinhaComNotas,
  garantirAbaComCabecalho,
  type NotaCelula,
} from './googleSheetsEscrita';

/**
 * "Eu quero absolutamente tudo na planilha" (pedido do usuário, 28/09/2026) — uma linha por
 * fechamento, com resumo em cada célula e o detalhe completo (produtos vendidos, cancelados,
 * despesas, etc.) numa NOTA anexada à célula (o triângulo no canto que abre ao clicar/passar o
 * mouse) — sem precisar de várias linhas/abas pra caber tudo.
 *
 * Só lê o que `salvar_fechamento` já gravou (totais já vêm prontos nas colunas da tabela
 * `fechamentos` — não recalcula nada aqui) + os filhos (entradas/sangrias/lancamentos/crediário/
 * transferências) + vendas/canceladas do dia (mesmas fontes que a tela usa, loja inteira — ver
 * useVendasCanceladas.ts/useVendasProdutoDia.ts).
 */

const CABECALHOS = [
  'Data',
  'Código',
  'Caixa',
  'Turno',
  'Responsável',
  'Vendas (VND)',
  'Transferências (CT)',
  'Despesas (DES)',
  'Mercadorias (MER)',
  'Retiradas (RET)',
  'Diferença',
  'Dinheiro Contado',
  'Lacre Final',
  'Produtos Vendidos',
  'Produtos Cancelados',
  'Entradas',
  'Sangrias',
  'Crediário',
  'Salvo em',
  'Máquina Desligada?',
  'Nº Clientes',
  'Ticket Médio',
  'Foto PDV',
  'Foto Manhã',
  'Foto Tarde',
  'Foto Folha Fechamento',
];

const BUCKET_ANEXOS = 'anexos';
const VALIDADE_LINK_FOTO_SEGUNDOS = 60 * 60 * 24 * 180; // 180 dias

function formatBRL(centavosOuValor: number | string | null): string {
  const numero = Number(centavosOuValor ?? 0);
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDataHora(iso: string | null): string {
  if (!iso) return '';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatHora(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
}

interface EventoMaquinaDesligada {
  inicio: string;
  fim: string;
  motivos: string[];
  outroTexto: string;
}

/** "Máquina desligada" agora é FATO detectado (heartbeat), não autodeclarado — ver
 * useDeteccaoMaquinaDesligada.ts. Cada evento vira "HH:MM–HH:MM (motivos)" na célula. */
function resumoMaquinaDesligada(eventos: EventoMaquinaDesligada[] | null): string {
  if (!eventos || eventos.length === 0) return 'Não';
  return eventos
    .map((e) => {
      const motivos = [...e.motivos, e.outroTexto].filter(Boolean).join(', ') || 'sem motivo informado';
      return `${formatHora(e.inicio)}–${formatHora(e.fim)} (${motivos})`;
    })
    .join('; ');
}

/** `vendas_canceladas_motivo_texto` guarda ou um JSON por item, ou (formato antigo) texto livre
 * compartilhado — mesma heurística de `colunaMotivoEhJsonDeItens` em useFechamentos.ts. */
function motivoCanceladoPorItem(texto: string | null): Record<string, string> | null {
  if (!texto) return null;
  try {
    const obj = JSON.parse(texto) as Record<string, { texto?: string; tipo?: string }>;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const mapa: Record<string, string> = {};
      for (const [id, m] of Object.entries(obj)) {
        mapa[id] = m?.texto?.trim() || (m?.tipo === 'audio' ? 'Áudio registrado' : '');
      }
      return mapa;
    }
  } catch {
    // não é JSON — formato antigo, texto único compartilhado (tratado fora desta função)
  }
  return null;
}

async function linkFoto(
  supabase: ReturnType<typeof useSupabaseAdmin>,
  path: string | null,
): Promise<string> {
  if (!path) return '';
  const { data, error } = await supabase.storage
    .from(BUCKET_ANEXOS)
    .createSignedUrl(path, VALIDADE_LINK_FOTO_SEGUNDOS);
  if (error || !data) return '';
  return data.signedUrl;
}

interface LinhaVendaProdutoDia {
  id: string;
  produto: string;
  quantidade: string;
  total: string;
  hora_venda: string | null;
}

export async function exportarFechamentoParaPlanilha(fechamentoId: string): Promise<{ linha: number }> {
  const config = useRuntimeConfig();
  const spreadsheetId = config.planilhaFechamentosId;
  const aba = config.planilhaFechamentosAba;
  if (!spreadsheetId) throw new Error('NUXT_PLANILHA_FECHAMENTOS_ID não configurado.');

  const supabase = useSupabaseAdmin();

  const { data: fechamento, error } = await supabase
    .from('fechamentos')
    .select(
      '*, entradas(*), sangrias(*), transferencias_caixa(*), lancamentos(*), crediario_itens(*), pdv_entradas(*)',
    )
    .eq('id', fechamentoId)
    .single();
  if (error || !fechamento) {
    throw new Error(`Fechamento ${fechamentoId} não encontrado: ${error?.message ?? ''}`);
  }

  const [{ data: produtosVendidos }, { data: produtosCanceladosAntigo }, { data: vendasCanceladasNovas }] =
    await Promise.all([
      supabase
        .from('vendas_produto_dia')
        .select('id, produto, quantidade, total, hora_venda')
        .eq('data_venda', fechamento.data)
        .eq('tipo', 'F'),
      supabase
        .from('vendas_produto_dia')
        .select('id, produto, quantidade, total, hora_venda')
        .eq('data_venda', fechamento.data)
        .eq('tipo', 'C'),
      supabase
        .from('vendas')
        .select('id_creare, pdv, hora_venda, vendas_itens(id, produto, quantidade, total)')
        .eq('data_venda', fechamento.data)
        .eq('status', 'CANCELADA'),
    ]);

  const [fotoPdv, fotoManha, fotoTarde, fotoFolha] = await Promise.all([
    linkFoto(supabase, fechamento.img_pdv_path),
    linkFoto(supabase, fechamento.img_manha_path),
    linkFoto(supabase, fechamento.img_tarde_path),
    linkFoto(supabase, fechamento.img_folha_fechamento_path),
  ]);

  const motivosPorItem = motivoCanceladoPorItem(fechamento.vendas_canceladas_motivo_texto);
  const motivoUnico =
    !motivosPorItem && fechamento.vendas_canceladas_motivo_texto?.trim()
      ? fechamento.vendas_canceladas_motivo_texto.trim()
      : null;

  const linhasVendidos = (produtosVendidos ?? []) as LinhaVendaProdutoDia[];
  const totalVendidosCents = linhasVendidos.reduce((s, p) => s + Math.round(Number(p.total) * 100), 0);
  const notaVendidos = linhasVendidos.length
    ? linhasVendidos
        .map((p) => `${p.produto} (${p.quantidade}) — ${formatBRL(Number(p.total))}`)
        .join('\n')
    : 'Nenhum produto sincronizado.';

  const canceladosAntigo = (produtosCanceladosAntigo ?? []) as LinhaVendaProdutoDia[];
  const canceladosLinhasTexto: string[] = [];
  let totalCanceladosCents = 0;
  for (const c of canceladosAntigo) {
    totalCanceladosCents += Math.round(Number(c.total) * 100);
    const motivo = motivosPorItem?.[c.id] || motivoUnico || 'Sem motivo informado';
    const hora = c.hora_venda ? ` às ${c.hora_venda.slice(0, 5)}` : '';
    canceladosLinhasTexto.push(`${c.produto} — ${formatBRL(Number(c.total))}${hora} — Motivo: ${motivo}`);
  }
  for (const v of (vendasCanceladasNovas ?? []) as {
    id_creare: string;
    pdv: string | null;
    hora_venda: string | null;
    vendas_itens: { id: string; produto: string; quantidade: string; total: string }[];
  }[]) {
    for (const item of v.vendas_itens ?? []) {
      totalCanceladosCents += Math.round(Number(item.total) * 100);
      const motivo = motivosPorItem?.[item.id] || motivoUnico || 'Sem motivo informado';
      const hora = v.hora_venda ? ` às ${v.hora_venda.slice(0, 5)}` : '';
      const pdv = v.pdv ? ` (PDV ${v.pdv})` : '';
      canceladosLinhasTexto.push(
        `${item.produto} — ${formatBRL(Number(item.total))}${hora}${pdv} — Motivo: ${motivo}`,
      );
    }
  }
  const notaCancelados = canceladosLinhasTexto.length
    ? canceladosLinhasTexto.join('\n')
    : 'Nenhum item cancelado.';
  const totalCancelados =
    canceladosAntigo.length + (vendasCanceladasNovas ?? []).reduce((s, v) => s + (v.vendas_itens?.length ?? 0), 0);

  const transferencias = fechamento.transferencias_caixa ?? [];
  const totalTransferenciasCents = transferencias.reduce(
    (s: number, t: { valor: string }) => s + Math.round(Number(t.valor) * 100),
    0,
  );
  const notaTransferencias = transferencias.length
    ? transferencias
        .map(
          (t: { caixa_origem: string; caixa_destino: string; lacre: string; valor: string }) =>
            `${t.caixa_origem} → ${t.caixa_destino} — Lacre ${t.lacre} — ${formatBRL(Number(t.valor))}`,
        )
        .join('\n')
    : 'Nenhuma transferência entre caixas.';

  const lancamentos = fechamento.lancamentos ?? [];
  function notaLancamentos(tipo: string): string {
    const itens = lancamentos.filter((l: { tipo: string }) => l.tipo === tipo);
    if (itens.length === 0) return 'Nenhum lançamento.';
    return itens
      .map(
        (l: { fornecedor: string; valor: string; valor_acrescimo: string; status: string }) =>
          `${l.fornecedor || 'Sem credor'} — ${formatBRL(Number(l.valor) + Number(l.valor_acrescimo))} — ${l.status === 'pago' ? 'Pago' : 'Não pago'}`,
      )
      .join('\n');
  }

  const entradas = fechamento.entradas ?? [];
  const totalEntradasCents = entradas.reduce(
    (s: number, e: { valor: string }) => s + Math.round(Number(e.valor) * 100),
    0,
  );
  const notaEntradas = entradas.length
    ? entradas
        .map(
          (e: { lacre: string; valor: string; descricao: string }) =>
            `Lacre ${e.lacre} — ${formatBRL(Number(e.valor))}${e.descricao ? ` — ${e.descricao}` : ''}`,
        )
        .join('\n')
    : 'Nenhuma entrada.';

  const sangrias = fechamento.sangrias ?? [];
  const totalSangriasCents = sangrias.reduce(
    (s: number, sa: { valor: string }) => s + Math.round(Number(sa.valor) * 100),
    0,
  );
  const notaSangrias = sangrias.length
    ? sangrias
        .map(
          (sa: { lacre: string; valor: string; descricao: string }) =>
            `Lacre ${sa.lacre} — ${formatBRL(Number(sa.valor))}${sa.descricao ? ` — ${sa.descricao}` : ''}`,
        )
        .join('\n')
    : 'Nenhuma sangria.';

  const crediario = fechamento.crediario_itens ?? [];
  const totalCrediarioCents = crediario.reduce(
    (s: number, c: { valor: string }) => s + Math.round(Number(c.valor) * 100),
    0,
  );
  const notaCrediario = crediario.length
    ? crediario
        .map((c: { nome: string; tipo: string; valor: string }) => `${c.nome} (${c.tipo}) — ${formatBRL(Number(c.valor))}`)
        .join('\n')
    : 'Nenhum item de crediário.';

  const valores: (string | number)[] = [
    fechamento.data,
    fechamento.codigo,
    fechamento.caixa,
    fechamento.turno,
    fechamento.responsavel,
    formatBRL(Number(fechamento.total_pdv)),
    formatBRL(totalTransferenciasCents / 100),
    formatBRL(Number(fechamento.rel_despesas)),
    formatBRL(Number(fechamento.rel_mercadoria)),
    formatBRL(Number(fechamento.rel_retiradas)),
    formatBRL(Number(fechamento.diferenca)),
    formatBRL(Number(fechamento.dinheiro_contado ?? 0)),
    fechamento.lacre_fechamento || '',
    `${linhasVendidos.length} produtos — ${formatBRL(totalVendidosCents / 100)}`,
    `${totalCancelados} cancelados — ${formatBRL(totalCanceladosCents / 100)}`,
    `${entradas.length} entradas — ${formatBRL(totalEntradasCents / 100)}`,
    `${sangrias.length} sangrias — ${formatBRL(totalSangriasCents / 100)}`,
    `${crediario.length} itens — ${formatBRL(totalCrediarioCents / 100)}`,
    formatDataHora(fechamento.atualizado_em ?? fechamento.criado_em),
    resumoMaquinaDesligada(fechamento.maquina_desligada_eventos),
    (fechamento.pdv_entradas ?? []).reduce(
      (s: number, p: { nr_clientes: number }) => s + Number(p.nr_clientes ?? 0),
      0,
    ),
    formatBRL(Number(fechamento.ticket_medio ?? 0)),
    fotoPdv,
    fotoManha,
    fotoTarde,
    fotoFolha,
  ];

  const notaCartoes = [
    `Conferência de cartões — Crédito: ${formatBRL(Number(fechamento.liq_credito))} · Débito: ${formatBRL(Number(fechamento.liq_debito))} · Pix: ${formatBRL(Number(fechamento.liq_pix))} · Voucher: ${formatBRL(Number(fechamento.liq_voucher))}`,
    `Maquininha manhã (nº ${fechamento.nr_maquininha || '—'}) — Crédito: ${formatBRL(Number(fechamento.credito_manha))} · Débito: ${formatBRL(Number(fechamento.debito_manha))} · Pix: ${formatBRL(Number(fechamento.pix_manha))} · Voucher: ${formatBRL(Number(fechamento.voucher_manha))}`,
    `Maquininha tarde (nº ${fechamento.nr_maquininha_tarde || '—'}) — Crédito: ${formatBRL(Number(fechamento.credito_tarde))} · Débito: ${formatBRL(Number(fechamento.debito_tarde))} · Pix: ${formatBRL(Number(fechamento.pix_tarde))} · Voucher: ${formatBRL(Number(fechamento.voucher_tarde))}`,
  ].join('\n');

  const notaDinheiroContado = [
    `Notas: ${formatBRL(Number(fechamento.dinheiro_contado_notas ?? 0))}`,
    `Moedas: ${formatBRL(Number(fechamento.dinheiro_contado_moedas ?? 0))}`,
    `Saldo esperado: ${formatBRL(Number(fechamento.saldo_fisico_esperado ?? 0))}`,
    `Conferido pelo operador: ${fechamento.dinheiro_contado_confirmado ? 'Sim' : 'Não'}`,
  ].join('\n');

  const notaCrediarioComTotais = [
    `Crédito clientes: ${formatBRL(Number(fechamento.total_cred_clientes ?? 0))} · Crédito colaboradores: ${formatBRL(Number(fechamento.total_cred_colab ?? 0))}`,
    notaCrediario,
  ].join('\n');

  const notas: NotaCelula[] = [
    { colunaIndice: 5, texto: notaCartoes },
    { colunaIndice: 6, texto: notaTransferencias },
    { colunaIndice: 7, texto: notaLancamentos('despesa') },
    { colunaIndice: 8, texto: notaLancamentos('mercadoria') },
    { colunaIndice: 9, texto: notaLancamentos('retirada') },
    { colunaIndice: 11, texto: notaDinheiroContado },
    { colunaIndice: 13, texto: notaVendidos },
    { colunaIndice: 14, texto: notaCancelados },
    { colunaIndice: 15, texto: notaEntradas },
    { colunaIndice: 16, texto: notaSangrias },
    { colunaIndice: 17, texto: notaCrediarioComTotais },
  ];

  const { sheetId } = await garantirAbaComCabecalho({
    credenciaisJson: config.googleServiceAccountJson,
    spreadsheetId,
    aba,
    cabecalhos: CABECALHOS,
  });

  return anexarLinhaComNotas({
    credenciaisJson: config.googleServiceAccountJson,
    spreadsheetId,
    aba,
    sheetId,
    valores,
    notas,
  });
}
