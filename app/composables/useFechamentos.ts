import { useSupabase } from './useSupabase';
import {
  calculateCardNet,
  calculateCrediarioTotais,
  calculateDiscrimination,
  calculateLancamentosPorTipo,
  calculatePdvEntradas,
  calculatePhysicalClosing,
  calculateRelatorioFinal,
  centsToDecimalString,
  sumValores,
  toCents,
} from '~/utils/financeiro';
import type {
  Caixa,
  CrediarioItemDraft,
  DiscriminacaoDraft,
  EntradaDraft,
  FechamentoDraft,
  FechamentoListItem,
  LancamentoDraft,
  PdvEntradaDraft,
  SangriaDraft,
  TipoContaEntrada,
  TransferenciaCaixaDraft,
  Turno,
} from '~/types/fechamento';

/** Formato bruto devolvido pela consulta (colunas do banco em snake_case, dinheiro em string decimal). */
interface EntradaRow {
  ordem: number;
  lacre: string;
  valor: string;
  descricao: string;
  tipo_conta: string | null;
}
interface SangriaRow {
  ordem: number;
  descricao: string;
  lacre: string;
  valor: string;
}
interface TransferenciaCaixaRow {
  ordem: number;
  caixa_origem: string | null;
  caixa_destino: string | null;
  valor: string;
  lacre: string;
  data: string | null;
  observacao: string;
}
interface LancamentoRow {
  id: string;
  ordem: number;
  tipo: LancamentoDraft['tipo'];
  status: LancamentoDraft['status'];
  data_ref: string | null;
  data_nfe: string | null;
  n_nfe: string;
  fornecedor: string;
  tipo_mer: string | null;
  valor: string;
  valor_acrescimo: string;
  tipo_credor: LancamentoDraft['tipoCredor'];
  obs_tipo: string | null;
  obs_texto: string;
  obs_audio_path: string | null;
  foto_path: string | null;
  vencimento: string | null;
  data_pagamento: string | null;
  foto_nota_path: string | null;
  origem_ajuste_creare: string;
}
interface DiscriminacaoRow {
  ordem: number;
  lancamento_id: string | null;
  tipo: DiscriminacaoDraft['tipo'];
  qtd: string;
  produto: string;
  grupo: string | null;
  val_unit: string;
  desconto_val: string;
  desconto_pct: string;
}
interface CrediarioItemRow {
  ordem: number;
  tipo: CrediarioItemDraft['tipo'];
  nome: string;
  valor: string;
  foto_path: string | null;
}
interface PdvEntradaRow {
  id: string;
  ordem: number;
  nr_clientes: number;
  dinheiro: string;
  credito: string;
  debito: string;
  pix: string;
  voucher: string;
  crediario: string;
}
interface FechamentoRow {
  id: string;
  codigo: string;
  data: string;
  caixa: string;
  turno: string;
  responsavel: string;
  relatorio_pdv: string;
  img_pdv_path: string | null;
  nr_maquininha: string;
  nr_maquininha_tarde: string;
  manha_inicial: string;
  tarde_final: string;
  credito_manha: string;
  debito_manha: string;
  pix_manha: string;
  voucher_manha: string;
  img_manha_path: string | null;
  credito_tarde: string;
  debito_tarde: string;
  pix_tarde: string;
  voucher_tarde: string;
  img_tarde_path: string | null;
  dinheiro_contado: string | null;
  cash_session_id: string | null;
  entradas: EntradaRow[];
  sangrias: SangriaRow[];
  transferencias_caixa: TransferenciaCaixaRow[];
  lancamentos: LancamentoRow[];
  discriminacoes: DiscriminacaoRow[];
  crediario_itens: CrediarioItemRow[];
  pdv_entradas: PdvEntradaRow[];
}

function ordenado<T extends { ordem: number }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => a.ordem - b.ordem);
}

/** Linha do banco pro deck — só os campos usados no card e na busca. */
interface ListRow {
  id: string;
  codigo: string;
  data: string;
  caixa: string;
  turno: string;
  responsavel: string;
  valor_total_final: string;
  diferenca: string;
  criado_em: string;
  entradas: { lacre: string; descricao: string; valor: string }[];
  sangrias: { lacre: string; descricao: string; valor: string }[];
  transferencias_caixa: {
    caixa_origem: string | null;
    caixa_destino: string | null;
    lacre: string;
    valor: string;
  }[];
  lancamentos: { tipo: string; status: string; fornecedor: string; valor: string }[];
  discriminacoes: { produto: string }[];
  crediario_itens: { tipo: string; nome: string; valor: string }[];
}

function linhaParaResumo(row: ListRow): FechamentoListItem {
  return {
    id: row.id,
    codigo: row.codigo,
    data: row.data,
    caixa: row.caixa,
    turno: row.turno,
    responsavel: row.responsavel,
    valorTotalFinalCents: toCents(row.valor_total_final),
    diferencaCents: toCents(row.diferenca),
    criadoEm: row.criado_em,
    entradas: row.entradas.map((e) => ({
      lacre: e.lacre,
      descricao: e.descricao,
      valorCents: toCents(e.valor),
    })),
    sangrias: row.sangrias.map((s) => ({
      lacre: s.lacre,
      descricao: s.descricao,
      valorCents: toCents(s.valor),
    })),
    transferenciasCaixa: row.transferencias_caixa.map((t) => ({
      caixaOrigem: t.caixa_origem ?? '',
      caixaDestino: t.caixa_destino ?? '',
      lacre: t.lacre,
      valorCents: toCents(t.valor),
    })),
    lancamentos: row.lancamentos.map((l) => ({
      tipo: l.tipo,
      status: l.status,
      fornecedor: l.fornecedor,
      valorCents: toCents(l.valor),
    })),
    discriminacoes: row.discriminacoes.map((d) => ({ produto: d.produto })),
    crediario: row.crediario_itens.map((c) => ({
      tipo: c.tipo,
      nome: c.nome,
      valorCents: toCents(c.valor),
    })),
  };
}

/** Converte a linha do banco de volta para o rascunho do formulário — o inverso de `salvar()`. */
function linhaParaDraft(row: FechamentoRow): FechamentoDraft {
  return {
    id: row.id,
    codigo: row.codigo,
    data: row.data,
    caixa: row.caixa as Caixa | '',
    turno: row.turno as Turno | '',
    responsavel: row.responsavel,
    entradas: ordenado(row.entradas).map((e): EntradaDraft => ({
      lacre: e.lacre,
      valorCents: toCents(e.valor),
      descricao: e.descricao,
      tipoConta: (e.tipo_conta ?? '') as TipoContaEntrada | '',
    })),
    sangrias: ordenado(row.sangrias).map((s): SangriaDraft => ({
      descricao: s.descricao,
      lacre: s.lacre,
      valorCents: toCents(s.valor),
    })),
    transferenciasCaixa: ordenado(row.transferencias_caixa).map((t): TransferenciaCaixaDraft => ({
      caixaOrigem: (t.caixa_origem ?? '') as Caixa | '',
      caixaDestino: (t.caixa_destino ?? '') as Caixa | '',
      valorCents: toCents(t.valor),
      lacre: t.lacre,
      data: t.data ?? '',
      observacao: t.observacao,
    })),
    lancamentos: ordenado(row.lancamentos).map((l): LancamentoDraft => ({
      id: l.id,
      tipo: l.tipo,
      status: l.status,
      dataRef: l.data_ref ?? '',
      dataNfe: l.data_nfe ?? '',
      nNfe: l.n_nfe,
      fornecedor: l.fornecedor,
      tipoMer: (l.tipo_mer ?? '') as LancamentoDraft['tipoMer'],
      valorCents: toCents(l.valor),
      valorAcrescimoCents: toCents(l.valor_acrescimo ?? 0),
      tipoCredor: l.tipo_credor ?? 'fornecedor',
      obsTipo: (l.obs_tipo ?? '') as LancamentoDraft['obsTipo'],
      obsTexto: l.obs_texto,
      obsAudioPath: l.obs_audio_path,
      fotoPath: l.foto_path,
      vencimento: l.vencimento ?? '',
      dataPagamento: l.data_pagamento ?? '',
      fotoNotaPath: l.foto_nota_path,
      origemAjusteCreare: l.origem_ajuste_creare ?? '',
    })),
    relatorioPdv: row.relatorio_pdv,
    pdvEntradas: ordenado(row.pdv_entradas).map((p): PdvEntradaDraft => ({
      id: p.id,
      nrClientes: p.nr_clientes,
      dinheiroCents: toCents(p.dinheiro),
      creditoCents: toCents(p.credito),
      debitoCents: toCents(p.debito),
      pixCents: toCents(p.pix),
      voucherCents: toCents(p.voucher),
      crediarioCents: toCents(p.crediario),
    })),
    imgPdvPath: row.img_pdv_path,
    nrMaquininha: row.nr_maquininha,
    nrMaquininhaTarde: row.nr_maquininha_tarde ?? '',
    manhaInicialCents: toCents(row.manha_inicial),
    tardeFinalCents: toCents(row.tarde_final),
    creditoManhaCents: toCents(row.credito_manha),
    debitoManhaCents: toCents(row.debito_manha),
    pixManhaCents: toCents(row.pix_manha),
    voucherManhaCents: toCents(row.voucher_manha),
    imgManhaPath: row.img_manha_path,
    creditoTardeCents: toCents(row.credito_tarde),
    debitoTardeCents: toCents(row.debito_tarde),
    pixTardeCents: toCents(row.pix_tarde),
    voucherTardeCents: toCents(row.voucher_tarde),
    imgTardePath: row.img_tarde_path,
    crediario: ordenado(row.crediario_itens).map((c): CrediarioItemDraft => ({
      tipo: c.tipo,
      nome: c.nome,
      valorCents: toCents(c.valor),
      fotoPath: c.foto_path,
    })),
    discriminacoes: ordenado(row.discriminacoes).map((d): DiscriminacaoDraft => ({
      lancamentoId: d.lancamento_id ?? '',
      tipo: d.tipo,
      qtd: parseFloat(d.qtd),
      produto: d.produto,
      grupo: (d.grupo ?? '') as DiscriminacaoDraft['grupo'],
      valUnitCents: toCents(d.val_unit),
      descontoValCents: toCents(d.desconto_val),
      descontoPct: parseFloat(d.desconto_pct),
    })),
    dinheiroContadoCents: toCents(row.dinheiro_contado ?? 0),
    cashSessionId: row.cash_session_id,
    // Só existe pro fluxo de abertura (ver criarFechamentoVazio) — reabrir um fechamento já
    // salvo pra edição não deve disparar o lookup de novo com um valor de Tesouraria que já
    // pode ter mudado; o que foi somado na Diferença na hora do Salvar já está gravado.
    lacreAbertura: '',
  };
}

/**
 * Grava o fechamento inteiro (registro principal + todos os itens filhos) numa única chamada
 * atômica — `salvar_fechamento` (ver `supabase/migrations/20260914100000_salvar_fechamento_rpc.sql`).
 * Mesma semântica do `salvarFechamento()` atual: reenvia o estado completo do formulário de uma vez.
 *
 * Todo valor derivado (totais, líquidos, diferença) é recalculado aqui a partir dos dados brutos
 * do rascunho pelo núcleo financeiro — nunca lido de um campo que a tela apenas exibe, depois de
 * dois bugs reais (Fase 4.5 e 4.6) causados exatamente por confiar num campo "espelho" que nada
 * mantinha sincronizado.
 */
export function useFechamentos() {
  const supabase = useSupabase();

  function cents(value: number): string {
    return centsToDecimalString(value || 0);
  }

  async function salvar(draft: FechamentoDraft): Promise<string> {
    if (
      draft.transferenciasCaixa.some(
        (t) => !t.caixaOrigem || !t.caixaDestino || t.caixaOrigem === t.caixaDestino,
      )
    ) {
      throw new Error('Toda transferência entre caixas precisa ter origem e destino diferentes.');
    }
    const totalEntradaCents = sumValores(draft.entradas);
    const totalSaidaCents = sumValores(draft.sangrias);

    // Transferência entre caixas com confirmação automática (pedido do usuário, 21/09/2026) —
    // mesma regra de useRelatorioCalculado.ts, mas buscada de novo aqui (não reaproveitada dali)
    // porque o valor PERSISTIDO em `diferenca`/`saldo_fisico_esperado` precisa ser o mais fresco
    // possível no exato momento do Salvar, não um snapshot que a tela já tinha carregado antes.
    const transferenciaSaidaCents = draft.transferenciasCaixa
      .filter((t) => t.caixaOrigem === draft.caixa)
      .reduce((s, t) => s + t.valorCents, 0);
    const { data: transferenciasRecebidasRows, error: erroTransferenciasRecebidas } =
      await supabase.rpc('transferencias_caixa_recebidas', { p_data: draft.data });
    // A RPC é uma melhoria opcional para bases que já receberam a migration nova. Durante uma
    // implantação gradual, uma base antiga ainda pode responder "função não encontrada"; isso não
    // pode impedir o salvamento do fechamento, que continua correto com entrada automática igual a
    // zero. Outros erros (rede, RLS, sessão expirada) continuam bloqueando o save e são exibidos.
    if (
      erroTransferenciasRecebidas &&
      !['42883', 'PGRST202'].includes(erroTransferenciasRecebidas.code ?? '')
    ) {
      throw erroTransferenciasRecebidas;
    }
    if (erroTransferenciasRecebidas)
      console.warn(
        '[fechamento] RPC de transferências recebidas ainda não disponível; usando zero.',
        erroTransferenciasRecebidas,
      );
    let transferenciaEntradaCents = (
      (erroTransferenciasRecebidas
        ? []
        : (transferenciasRecebidasRows as { valor_total_cents: number }[] | null)) ?? []
    ).reduce((s, r) => s + Number(r.valor_total_cents), 0);

    // Lacre de abertura (pedido do usuário, 22/09/2026) — mesmo lookup de Tesouraria de sempre,
    // buscado de novo aqui pelo mesmo motivo do bloco acima: precisa ser o valor mais fresco no
    // exato momento do Salvar. Soma no mesmo total de "Transferências Automáticas" (entram na
    // Diferença Geral igual a uma transferência entre caixas recebida).
    if (draft.lacreAbertura.trim()) {
      const { data: linhaLacre, error: erroLacre } = await supabase.rpc(
        'buscar_transferencia_tesouraria_por_lacre',
        { p_lacre: draft.lacreAbertura.trim() },
      );
      if (erroLacre) throw erroLacre;
      const valorLacreCents = Math.round(
        Number((linhaLacre as { valor: string }[] | null)?.[0]?.valor ?? 0) * 100,
      );
      transferenciaEntradaCents += valorLacreCents;
    }

    const pdv = calculatePdvEntradas(
      draft.pdvEntradas.map((e) => ({
        nrClientes: e.nrClientes,
        dinheiroCents: e.dinheiroCents,
        creditoCents: e.creditoCents,
        debitoCents: e.debitoCents,
        pixCents: e.pixCents,
        voucherCents: e.voucherCents,
        crediarioCents: e.crediarioCents,
      })),
    );

    const liqCreditoCents = calculateCardNet(draft.creditoManhaCents, draft.creditoTardeCents);
    const liqDebitoCents = calculateCardNet(draft.debitoManhaCents, draft.debitoTardeCents);
    const liqPixCents = calculateCardNet(draft.pixManhaCents, draft.pixTardeCents);
    const liqVoucherCents = calculateCardNet(draft.voucherManhaCents, draft.voucherTardeCents);

    const crediarioTotais = calculateCrediarioTotais(
      draft.crediario.map((c) => ({ tipo: c.tipo, valorCents: c.valorCents })),
    );

    const lancamentosPorTipo = calculateLancamentosPorTipo(
      draft.lancamentos.map((l) => ({
        tipo: l.tipo,
        valorCents: l.valorCents,
        valorAcrescimoCents: l.valorAcrescimoCents,
      })),
    );

    // Fórmula principal (Seção 6 — Relatório Final), idêntica à do app atual.
    const relatorio = calculateRelatorioFinal({
      totalEntradaCents,
      totalSaidaCents,
      despesasCents: lancamentosPorTipo.despesaCents,
      mercadoriaCents: lancamentosPorTipo.mercadoriaCents,
      retiradasCents: lancamentosPorTipo.retiradaCents,
      transferenciaSaidaCents,
      transferenciaEntradaCents,
      totalPdvCents: pdv.totalCents,
      liqCreditoCents,
      liqDebitoCents,
      liqPixCents,
      liqVoucherCents,
      totalCrediarioCents: crediarioTotais.totalCents,
      pdvCreditoCents: pdv.creditoCents,
      pdvDebitoCents: pdv.debitoCents,
      pdvPixCents: pdv.pixCents,
      pdvVoucherCents: pdv.voucherCents,
      pdvCrediarioCents: pdv.crediarioCents,
    });

    // Card aditivo "esperado × contado" (decisão do plano — não substitui `diferenca`).
    const fisico = calculatePhysicalClosing({
      pdvCashCents: pdv.dinheiroCents,
      entriesCents: totalEntradaCents,
      cashDropsCents: totalSaidaCents,
      expensesCents: lancamentosPorTipo.despesaCents,
      merchandiseCents: lancamentosPorTipo.mercadoriaCents,
      withdrawalsCents: lancamentosPorTipo.retiradaCents,
      transferOutCents: transferenciaSaidaCents,
      transferInCents: transferenciaEntradaCents,
      countedCents: draft.dinheiroContadoCents,
    });

    const payload = {
      fechamento: {
        id: draft.id,
        codigo: draft.codigo,
        data: draft.data,
        caixa: draft.caixa,
        turno: draft.turno,
        responsavel: draft.responsavel,
        total_entrada: cents(totalEntradaCents),
        total_saida: cents(totalSaidaCents),
        relatorio_pdv: draft.relatorioPdv,
        total_pdv: cents(pdv.totalCents),
        ticket_medio: cents(pdv.averageTicketCents),
        img_pdv_path: draft.imgPdvPath,
        nr_maquininha: draft.nrMaquininha,
        nr_maquininha_tarde: draft.nrMaquininhaTarde,
        manha_inicial: cents(draft.manhaInicialCents),
        tarde_final: cents(draft.tardeFinalCents),
        credito_manha: cents(draft.creditoManhaCents),
        debito_manha: cents(draft.debitoManhaCents),
        pix_manha: cents(draft.pixManhaCents),
        voucher_manha: cents(draft.voucherManhaCents),
        img_manha_path: draft.imgManhaPath,
        credito_tarde: cents(draft.creditoTardeCents),
        debito_tarde: cents(draft.debitoTardeCents),
        pix_tarde: cents(draft.pixTardeCents),
        voucher_tarde: cents(draft.voucherTardeCents),
        img_tarde_path: draft.imgTardePath,
        liq_credito: cents(liqCreditoCents),
        liq_debito: cents(liqDebitoCents),
        liq_pix: cents(liqPixCents),
        liq_voucher: cents(liqVoucherCents),
        total_cred_clientes: cents(crediarioTotais.clientesCents),
        total_cred_colab: cents(crediarioTotais.colaboradoresCents),
        total_crediario: cents(crediarioTotais.totalCents),
        rel_despesas: cents(lancamentosPorTipo.despesaCents),
        rel_mercadoria: cents(lancamentosPorTipo.mercadoriaCents),
        rel_retiradas: cents(lancamentosPorTipo.retiradaCents),
        rel_cartoes: cents(relatorio.cartoesCents),
        valor_total_final: cents(relatorio.valorTotalFinalCents),
        diferenca: cents(relatorio.diferencaCents),
        rel_pdv_diferenca: cents(relatorio.relPdvDiferencaCents),
        dinheiro_contado: cents(draft.dinheiroContadoCents),
        saldo_fisico_esperado: cents(fisico.expectedCents),
        cash_session_id: draft.cashSessionId,
      },
      entradas: draft.entradas.map((e) => ({
        lacre: e.lacre,
        valor: cents(e.valorCents),
        descricao: e.descricao,
        tipoConta: e.tipoConta,
      })),
      sangrias: draft.sangrias.map((s) => ({
        descricao: s.descricao,
        lacre: s.lacre,
        valor: cents(s.valorCents),
      })),
      transferenciasCaixa: draft.transferenciasCaixa.map((t) => ({
        caixaOrigem: t.caixaOrigem,
        caixaDestino: t.caixaDestino,
        valor: cents(t.valorCents),
        lacre: t.lacre,
        data: t.data,
        observacao: t.observacao,
      })),
      lancamentos: draft.lancamentos.map((l) => ({
        id: l.id,
        tipo: l.tipo,
        status: l.status,
        dataRef: l.dataRef,
        dataNfe: l.dataNfe,
        nNfe: l.nNfe,
        fornecedor: l.fornecedor,
        tipoMer: l.tipoMer,
        valor: cents(l.valorCents),
        valorAcrescimo: cents(l.valorAcrescimoCents),
        tipoCredor: l.tipoCredor,
        obsTipo: l.obsTipo,
        obsTexto: l.obsTexto,
        obsAudioPath: l.obsAudioPath,
        fotoPath: l.fotoPath,
        vencimento: l.vencimento,
        dataPagamento: l.dataPagamento,
        fotoNotaPath: l.fotoNotaPath,
        origemAjusteCreare: l.origemAjusteCreare,
      })),
      discriminacoes: draft.discriminacoes.map((d) => ({
        lancamentoId: d.lancamentoId,
        tipo: d.tipo,
        qtd: d.qtd,
        produto: d.produto,
        grupo: d.grupo,
        valUnit: cents(d.valUnitCents),
        descontoVal: cents(d.descontoValCents),
        descontoPct: d.descontoPct,
        total: cents(
          calculateDiscrimination({
            quantity: d.qtd,
            unitValueCents: d.valUnitCents,
            fixedDiscountCents: d.descontoValCents,
            discountPercent: d.descontoPct,
          }).totalCents,
        ),
      })),
      crediario: draft.crediario.map((c) => ({
        tipo: c.tipo,
        nome: c.nome,
        valor: cents(c.valorCents),
        fotoPath: c.fotoPath,
      })),
      pdvEntradas: draft.pdvEntradas.map((p) => ({
        nrClientes: p.nrClientes,
        dinheiro: cents(p.dinheiroCents),
        credito: cents(p.creditoCents),
        debito: cents(p.debitoCents),
        pix: cents(p.pixCents),
        voucher: cents(p.voucherCents),
        crediario: cents(p.crediarioCents),
      })),
    };

    const { data, error } = await supabase.rpc('salvar_fechamento', { payload });
    if (error) throw error;
    return data as string;
  }

  /** Busca um fechamento salvo com todos os itens filhos e devolve pronto pro formulário. */
  async function obter(id: string): Promise<FechamentoDraft> {
    const { data, error } = await supabase
      .from('fechamentos')
      .select(
        '*, entradas(*), sangrias(*), transferencias_caixa(*), lancamentos(*), discriminacoes(*), crediario_itens(*), pdv_entradas(*)',
      )
      .eq('id', id)
      .single();
    if (error) throw error;
    return linhaParaDraft(data as FechamentoRow);
  }

  /** Lista todos os fechamentos, mais recentes primeiro — mesma ordenação do deck atual. */
  async function listar(): Promise<FechamentoListItem[]> {
    const { data, error } = await supabase
      .from('fechamentos')
      .select(
        'id, codigo, data, caixa, turno, responsavel, valor_total_final, diferenca, criado_em, ' +
          'entradas(lacre, descricao, valor), sangrias(lacre, descricao, valor), ' +
          'transferencias_caixa(caixa_origem, caixa_destino, lacre, valor), ' +
          'lancamentos(tipo, status, fornecedor, valor), discriminacoes(produto), ' +
          'crediario_itens(tipo, nome, valor)',
      )
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return (data as unknown as ListRow[]).map(linhaParaResumo);
  }

  /** Exclui o fechamento e os anexos dele no Storage — sem confirmação/soft-delete (igual hoje). */
  async function excluir(id: string): Promise<void> {
    const { data: objetos } = await supabase.storage.from('anexos').list(id);
    if (objetos && objetos.length > 0) {
      await supabase.storage.from('anexos').remove(objetos.map((o) => `${id}/${o.name}`));
    }
    const { error } = await supabase.from('fechamentos').delete().eq('id', id);
    if (error) throw error;
  }

  return { salvar, obter, listar, excluir };
}
