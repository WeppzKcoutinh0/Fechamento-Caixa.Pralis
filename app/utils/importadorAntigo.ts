/**
 * Converte um registro do `localStorage["fechamentos_caixa"]` do app antigo (HTML/JS puro) pro
 * formato do rascunho novo — usado só no importador único do primeiro acesso (decisão do plano).
 *
 * O registro antigo nunca salvou vários campos que hoje persistimos de verdade (relatório PDV,
 * número da maquininha, valores brutos de manhã/tarde, dinheiro contado) — não tem como importar
 * o que nunca existiu, então esses campos chegam vazios/zerados, sem que isso seja uma regressão.
 */
import { criarFechamentoVazio, type FechamentoDraft } from '~/types/fechamento';
import { toCents } from './financeiro';

const CHAVE_LOCALSTORAGE = 'fechamentos_caixa';

interface RegistroAntigo {
  id?: string;
  data?: string;
  caixa?: string;
  turno?: string;
  responsavel?: string;
  entradas?: { lacre?: string; valor?: string | number; descricao?: string }[];
  sangrias?: { descricao?: string; lacre?: string; valor?: string | number }[];
  lancamentos?: {
    tipo?: string;
    status?: string;
    dataRef?: string;
    dataNfe?: string;
    nNfe?: string;
    fornecedor?: string;
    tipoMer?: string;
    valor?: string | number;
    obsTipo?: string;
    obsTexto?: string;
    vencimento?: string;
  }[];
  discriminacoes?: {
    tipo?: string;
    qtd?: number;
    produto?: string;
    grupo?: string;
    valUnit?: string | number;
    descontoVal?: string | number;
    descontoPct?: number;
  }[];
  crediario?: { tipo?: string; nome?: string; valor?: string | number }[];
  nrClientes?: string | number;
  pdvDinheiro?: string | number;
  pdvCredito?: string | number;
  pdvDebito?: string | number;
  pdvPix?: string | number;
  pdvVoucher?: string | number;
  pdvCrediario?: string | number;
}

function textoDe(valor: unknown, padrao = ''): string {
  return typeof valor === 'string' ? valor : padrao;
}
function tipoLancamentoValido(tipo: unknown): 'despesa' | 'mercadoria' | 'retirada' {
  return tipo === 'despesa' || tipo === 'mercadoria' || tipo === 'retirada' ? tipo : 'despesa';
}
function statusValido(status: unknown): 'pago' | 'naopago' {
  return status === 'pago' ? 'pago' : 'naopago';
}
function obsTipoValido(tipo: unknown): 'texto' | 'audio' | '' {
  return tipo === 'texto' || tipo === 'audio' ? tipo : '';
}
function tipoMerValido(tipo: unknown): 'computado' | 'nao_computado' | '' {
  return tipo === 'computado' || tipo === 'nao_computado' ? tipo : '';
}
function tipoCrediarioValido(tipo: unknown): 'cliente' | 'colaborador' {
  return tipo === 'colaborador' ? 'colaborador' : 'cliente';
}

/** Lê a chave antiga do localStorage; devolve `[]` se não existir/estiver corrompida. */
export function lerRegistrosAntigos(): RegistroAntigo[] {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCALSTORAGE);
    if (!bruto) return [];
    const dados: unknown = JSON.parse(bruto);
    return Array.isArray(dados) ? (dados as RegistroAntigo[]) : [];
  } catch {
    return [];
  }
}

export function draftDoRegistroAntigo(reg: RegistroAntigo): FechamentoDraft {
  const draft = criarFechamentoVazio();

  draft.codigo = textoDe(reg.id, draft.codigo); // preserva o "FC-..." antigo como código legível
  draft.data = textoDe(reg.data, draft.data);
  draft.caixa = (textoDe(reg.caixa) || '') as FechamentoDraft['caixa'];
  draft.turno = (textoDe(reg.turno) || '') as FechamentoDraft['turno'];
  draft.responsavel = textoDe(reg.responsavel);

  draft.entradas = (reg.entradas ?? []).map((e) => ({
    lacre: textoDe(e.lacre),
    valorCents: toCents(e.valor ?? 0),
    descricao: textoDe(e.descricao),
  }));
  draft.sangrias = (reg.sangrias ?? []).map((s) => ({
    descricao: textoDe(s.descricao),
    lacre: textoDe(s.lacre),
    valorCents: toCents(s.valor ?? 0),
  }));
  draft.lancamentos = (reg.lancamentos ?? []).map((l) => ({
    // Gerado agora — o formato antigo (localStorage) não tinha id de lançamento porque só existia
    // no máximo 1 por tipo (a mesma limitação que este importador está com pressa de corrigir).
    id: crypto.randomUUID(),
    tipo: tipoLancamentoValido(l.tipo),
    status: statusValido(l.status),
    dataRef: textoDe(l.dataRef),
    dataNfe: textoDe(l.dataNfe),
    nNfe: textoDe(l.nNfe),
    fornecedor: textoDe(l.fornecedor),
    tipoMer: tipoMerValido(l.tipoMer),
    valorCents: toCents(l.valor ?? 0),
    // Juros/tipo de credor/data de pagamento não existiam no formato antigo — extensão aditiva
    // posterior (ver types/fechamento.ts), registro migrado nasce com os defaults neutros.
    valorAcrescimoCents: 0,
    tipoCredor: 'fornecedor',
    obsTipo: obsTipoValido(l.obsTipo),
    obsTexto: textoDe(l.obsTexto),
    obsAudioPath: null, // áudio antigo era base64 solto — sem path de Storage pra migrar
    fotoPath: null,
    vencimento: textoDe(l.vencimento),
    dataPagamento: '',
    fotoNotaPath: null,
  }));
  // Formato antigo só tinha `tipo` na discriminação (nunca existiu mais de 1 lançamento por tipo
  // lá) — liga ao primeiro lançamento migrado daquele tipo, que é exatamente a que ela pertencia.
  const primeiroLancamentoPorTipo = new Map(draft.lancamentos.map((l) => [l.tipo, l.id]));
  draft.discriminacoes = (reg.discriminacoes ?? []).map((d) => ({
    lancamentoId: primeiroLancamentoPorTipo.get(tipoLancamentoValido(d.tipo)) ?? '',
    tipo: tipoLancamentoValido(d.tipo),
    qtd: typeof d.qtd === 'number' ? d.qtd : 0,
    produto: textoDe(d.produto),
    grupo: (textoDe(d.grupo) || '') as FechamentoDraft['discriminacoes'][number]['grupo'],
    valUnitCents: toCents(d.valUnit ?? 0),
    descontoValCents: toCents(d.descontoVal ?? 0),
    descontoPct: typeof d.descontoPct === 'number' ? d.descontoPct : 0,
  }));
  draft.crediario = (reg.crediario ?? []).map((c) => ({
    tipo: tipoCrediarioValido(c.tipo),
    nome: textoDe(c.nome),
    valorCents: toCents(c.valor ?? 0),
    fotoPath: null,
  }));

  // Formato antigo só tinha 1 PDV por fechamento (a mesma limitação que Relatório PDV virou lista
  // pra corrigir) — migra pro único item da lista nova.
  draft.pdvEntradas = [
    {
      id: crypto.randomUUID(),
      nrClientes:
        typeof reg.nrClientes === 'number'
          ? reg.nrClientes
          : parseInt(textoDe(reg.nrClientes, '0'), 10) || 0,
      dinheiroCents: toCents(reg.pdvDinheiro ?? 0),
      creditoCents: toCents(reg.pdvCredito ?? 0),
      debitoCents: toCents(reg.pdvDebito ?? 0),
      pixCents: toCents(reg.pdvPix ?? 0),
      voucherCents: toCents(reg.pdvVoucher ?? 0),
      crediarioCents: toCents(reg.pdvCrediario ?? 0),
    },
  ];

  return draft;
}
