import { useSupabase } from './useSupabase';
import { hojeISO, type Caixa, type Turno } from '~/types/fechamento';

// Caixa Principal / Caixa de Troco / Fluxo (pedido do usuário, 23/09/2026): três cofres centrais
// NOVOS, independentes do "Cofre" genérico que já existia — decisão explícita do usuário de não
// misturar os dois conceitos. Ciclo: CAIXA PRINCIPAL → CAIXA DE TROCO → CAIXAS/FLUXO →
// CONFERÊNCIA → (parte fica no Fluxo, parte volta pro Principal) → recomeça.
// Deriva de Caixa (~/types/fechamento.ts) em vez de repetir os literais — Caixa 5 (ou qualquer
// caixa futuro) entra aqui automaticamente assim que entrar em CAIXAS lá.
export type CaixaOuCofre = Caixa | 'Cofre' | 'Caixa Principal' | 'Caixa de Troco' | 'Fluxo';

export const COFRES_CENTRAIS = ['Caixa Principal', 'Caixa de Troco', 'Fluxo'] as const;
export type CofreCentral = (typeof COFRES_CENTRAIS)[number];

export interface DestinoExtra {
  caixa: CaixaOuCofre;
  valorCents?: number;
}

export interface TransferenciaTesouraria {
  id: string;
  valorCents: number;
  valorNotasCents: number;
  valorMoedasCents: number;
  lacre: string;
  dataLanc: string;
  agendamento: boolean;
  dataRecebimento: string | null;
  confirmadoEm: string | null;
  caixaOrigem: CaixaOuCofre;
  caixaDestino: CaixaOuCofre;
  // Pedido do usuário (25/09/2026): "Caixa 1" sozinho é ambíguo (manhã ou tarde?) — só faz
  // sentido quando caixaOrigem/caixaDestino é um Caixa de verdade (não Cofre/Fluxo/etc).
  turnoOrigem: Turno | null;
  turnoDestino: Turno | null;
  multiploDestino: boolean;
  destinosExtra: DestinoExtra[];
  tempoConfirmacao: boolean;
  transferenciaRetorno: boolean;
  observacao: string;
  criadoEm: string;
}

interface LinhaRow {
  id: string;
  valor: string;
  valor_notas: string;
  valor_moedas: string;
  lacre: string;
  data_lanc: string;
  agendamento: boolean;
  data_recebimento: string | null;
  confirmado_em: string | null;
  caixa_origem: CaixaOuCofre;
  caixa_destino: CaixaOuCofre;
  turno_origem: Turno | null;
  turno_destino: Turno | null;
  multiplo_destino: boolean;
  destinos_extra: { caixa: CaixaOuCofre; valor?: number }[];
  tempo_confirmacao: boolean;
  transferencia_retorno: boolean;
  observacao: string;
  criado_em: string;
}

function linhaParaTransferencia(l: LinhaRow): TransferenciaTesouraria {
  return {
    id: l.id,
    valorCents: Math.round(Number(l.valor) * 100),
    valorNotasCents: Math.round(Number(l.valor_notas) * 100),
    valorMoedasCents: Math.round(Number(l.valor_moedas) * 100),
    lacre: l.lacre,
    dataLanc: l.data_lanc,
    agendamento: l.agendamento,
    dataRecebimento: l.data_recebimento,
    confirmadoEm: l.confirmado_em,
    caixaOrigem: l.caixa_origem,
    caixaDestino: l.caixa_destino,
    turnoOrigem: l.turno_origem,
    turnoDestino: l.turno_destino,
    multiploDestino: l.multiplo_destino,
    destinosExtra: (l.destinos_extra ?? []).map((d) => ({
      caixa: d.caixa,
      ...(d.valor == null ? {} : { valorCents: Math.round(Number(d.valor) * 100) }),
    })),
    tempoConfirmacao: l.tempo_confirmacao,
    transferenciaRetorno: l.transferencia_retorno,
    observacao: l.observacao,
    criadoEm: l.criado_em,
  };
}

const SELECT_COLUNAS =
  'id, valor, valor_notas, valor_moedas, lacre, data_lanc, agendamento, data_recebimento, confirmado_em, caixa_origem, caixa_destino, ' +
  'turno_origem, turno_destino, multiplo_destino, destinos_extra, tempo_confirmacao, transferencia_retorno, observacao, criado_em';

/**
 * Tesouraria central (18/09/2026, pedido do usuário) — transferências independentes de qualquer
 * fechamento (ver migration `20260918101000_transferencias_tesouraria.sql`). O ponto principal:
 * `buscarPorLacre()` é o "cadastro de lacres com valor pré-definido" que `SecaoTransferencias.vue`
 * usa pra preencher o valor da Entrada sozinho quando o número bate com um lacre já cadastrado
 * aqui.
 */
export function useTransferenciasTesouraria() {
  const supabase = useSupabase();

  async function listar(): Promise<TransferenciaTesouraria[]> {
    const { data, error } = await supabase
      .from('transferencias_tesouraria')
      .select(SELECT_COLUNAS)
      .order('criado_em', { ascending: false });
    if (error) throw error;
    return (data as unknown as LinhaRow[]).map(linhaParaTransferencia);
  }

  /** Usado pelo lookup automático no wizard — `null` quando não existe (deixa o usuário digitar o valor à mão, como sempre). */
  async function buscarPorLacre(lacre: string): Promise<TransferenciaTesouraria | null> {
    const alvo = lacre.trim();
    if (!alvo) return null;
    const { data, error } = await supabase.rpc('buscar_transferencia_tesouraria_por_lacre', {
      p_lacre: alvo,
    });
    if (error) throw error;
    const linha = (data as unknown as LinhaRow[] | null)?.[0];
    return linha ? linhaParaTransferencia(linha) : null;
  }

  async function criar(dados: {
    valorCents: number;
    valorNotasCents: number;
    valorMoedasCents: number;
    lacre: string;
    agendamento: boolean;
    caixaOrigem: CaixaOuCofre;
    caixaDestino: CaixaOuCofre;
    // Só fazem sentido quando o respectivo caixaOrigem/caixaDestino é um Caixa (não
    // Cofre/Fluxo/etc) — pedido do usuário (25/09/2026): "Caixa 1" sozinho não diz de qual turno.
    turnoOrigem?: Turno | null;
    turnoDestino?: Turno | null;
    multiploDestino: boolean;
    destinosExtra: DestinoExtra[];
    tempoConfirmacao: boolean;
    transferenciaRetorno: boolean;
    observacao: string;
    // Formulário completo (admin, Nova Transferência) sempre usa hoje — campo readonly lá. Os
    // lançamentos rápidos de /cofres.vue (pedido do usuário, 23/09/2026) deixam o operador
    // escolher a data (registrando algo de um dia anterior, ex.: "caixa do dia 21/09").
    dataLanc?: string;
  }): Promise<TransferenciaTesouraria> {
    const destinosExtras = [...new Set(dados.destinosExtra.map((d) => d.caixa))]
      .filter((caixa) => caixa !== dados.caixaOrigem && caixa !== dados.caixaDestino)
      .map((caixa) => ({ caixa }));
    const { data, error } = await supabase
      .from('transferencias_tesouraria')
      .insert({
        valor: (dados.valorCents / 100).toFixed(2),
        valor_notas: (dados.valorNotasCents / 100).toFixed(2),
        valor_moedas: (dados.valorMoedasCents / 100).toFixed(2),
        lacre: dados.lacre.trim(),
        data_lanc: dados.dataLanc || hojeISO(),
        agendamento: dados.agendamento,
        caixa_origem: dados.caixaOrigem,
        caixa_destino: dados.caixaDestino,
        // `||` de propósito (não `??`): string vazia do v-select "sem seleção" tem que virar null
        // igual undefined/null — a coluna só aceita 'Manhã'/'Tarde'/null (achado real, 25/09/2026:
        // string vazia violava o check constraint em vez de ser tratada como "sem turno").
        turno_origem: dados.turnoOrigem || null,
        turno_destino: dados.turnoDestino || null,
        multiplo_destino: dados.multiploDestino,
        destinos_extra: destinosExtras,
        tempo_confirmacao: dados.tempoConfirmacao,
        transferencia_retorno: dados.transferenciaRetorno,
        observacao: dados.observacao,
        // Sem agendamento/confirmação pendente: já nasce confirmada, recebida hoje mesmo.
        data_recebimento: dados.agendamento || dados.tempoConfirmacao ? null : hojeISO(),
      })
      .select(SELECT_COLUNAS)
      .single();
    if (error) throw error;
    return linhaParaTransferencia(data as unknown as LinhaRow);
  }

  async function confirmarRecebimento(id: string): Promise<void> {
    const { error } = await supabase
      .from('transferencias_tesouraria')
      .update({ data_recebimento: hojeISO(), confirmado_em: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .single();
    if (error) throw error;
  }

  async function excluir(id: string): Promise<void> {
    const { error } = await supabase.from('transferencias_tesouraria').delete().eq('id', id);
    if (error) throw error;
  }

  async function editar(
    id: string,
    dados: {
      valorCents: number;
      lacre: string;
      dataLanc: string;
      caixaOrigem: CaixaOuCofre;
      caixaDestino: CaixaOuCofre;
      observacao: string;
    },
  ): Promise<void> {
    const { error } = await supabase
      .from('transferencias_tesouraria')
      .update({
        valor: (dados.valorCents / 100).toFixed(2),
        lacre: dados.lacre.trim(),
        data_lanc: dados.dataLanc,
        caixa_origem: dados.caixaOrigem,
        caixa_destino: dados.caixaDestino,
        observacao: dados.observacao,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
  }

  /**
   * Retorno automático pro cofre (18/09/2026, pedido do usuário — versão simplificada do que o
   * Sistema Inteligente Pralís faz no fechamento: se sobrar dinheiro contado, ele volta pra
   * tesouraria sozinho, pendente de confirmação). Chamada pelo `WizardFechamento.vue` depois que
   * `salvar()` já teve sucesso — melhor esforço: se isto falhar, o fechamento já está salvo, só o
   * retorno automático que não foi criado (o usuário ainda pode criar manual em `/transferencias`).
   * Idempotente no banco (`on conflict (lacre) do nothing`) — resalvar o mesmo fechamento nunca duplica.
   */
  async function criarRetornoAutomatico(dados: {
    fechamentoId: string;
    caixa: Caixa;
    codigo: string;
    valorCents: number;
    valorNotasCents?: number;
    valorMoedasCents?: number;
    lacre?: string;
  }): Promise<void> {
    if (dados.valorCents <= 0) return;
    const { error } = await supabase.rpc('criar_retorno_automatico_tesouraria', {
      p_fechamento_id: dados.fechamentoId,
      p_caixa: dados.caixa,
      p_codigo: dados.codigo,
      p_valor: (dados.valorCents / 100).toFixed(2),
      p_valor_notas: ((dados.valorNotasCents ?? 0) / 100).toFixed(2),
      p_valor_moedas: ((dados.valorMoedasCents ?? 0) / 100).toFixed(2),
      p_lacre: dados.lacre?.trim() || null,
    });
    if (error) throw error;
  }

  /**
   * Sangria automática pro Fluxo (23/09/2026, pedido do usuário — correção de conceito: "Fluxo é
   * tudo o que sobe dos caixas: sangrias e o valor total ao fechar o caixa"). Mesmo padrão exato
   * de `criarRetornoAutomatico` (melhor esforço depois do `salvar()`, idempotente por lacre).
   */
  async function criarSangriaAutomatica(dados: {
    fechamentoId: string;
    caixa: Caixa;
    codigo: string;
    valorCents: number;
  }): Promise<void> {
    if (dados.valorCents <= 0) return;
    const { error } = await supabase.rpc('criar_sangria_automatica_tesouraria', {
      p_fechamento_id: dados.fechamentoId,
      p_caixa: dados.caixa,
      p_codigo: dados.codigo,
      p_valor: (dados.valorCents / 100).toFixed(2),
    });
    if (error) throw error;
  }

  return {
    listar,
    buscarPorLacre,
    criar,
    confirmarRecebimento,
    excluir,
    editar,
    criarRetornoAutomatico,
    criarSangriaAutomatica,
  };
}
