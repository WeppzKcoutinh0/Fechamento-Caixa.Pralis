import { useSupabase } from './useSupabase';
import { useAuth } from './useAuth';
import type { Caixa, Turno } from '~/types/fechamento';
import { hojeISO } from '~/types/fechamento';

export interface SessaoCaixa {
  id: string;
  caixa: Caixa;
  turno: Turno;
  businessDate: string;
  openedAt: string;
  status: 'ABERTO' | 'FECHADO';
  lacreAbertura: string;
}

interface SessaoRow {
  id: string;
  caixa: Caixa;
  turno: Turno;
  business_date: string;
  opened_at: string;
  status: 'ABERTO' | 'FECHADO';
  lacre_abertura: string | null;
}

function linhaParaSessao(l: SessaoRow): SessaoCaixa {
  return {
    id: l.id,
    caixa: l.caixa,
    turno: l.turno,
    businessDate: l.business_date,
    openedAt: l.opened_at,
    status: l.status,
    lacreAbertura: l.lacre_abertura ?? '',
  };
}

const SELECT_SESSAO = 'id, caixa, turno, business_date, opened_at, status, lacre_abertura';

/**
 * Fluxo de Caixa (18/09/2026): a sessão de caixa ABERTA do usuário logado (no máximo uma —
 * garantido pela unique index `cash_sessions_uma_por_usuario`, ver
 * `20260918100200_cash_sessions.sql`), e as ações de abrir/fechar/encerrar. `PainelCaixaOperacional.vue`
 * é o único lugar que lê `sessaoAtual` pra decidir o que mostrar; `pages/fechamentos/novo.vue` lê
 * pra travar Caixa/Turno/Data do draft.
 */
export function useSessaoCaixa() {
  const supabase = useSupabase();
  const { session } = useAuth();
  const sessaoAtual = useState<SessaoCaixa | null>('sessao-caixa-atual', () => null);
  const carregando = useState<boolean>('sessao-caixa-carregando', () => false);
  const erro = useState<string | null>('sessao-caixa-erro', () => null);

  async function carregarSessaoAtual(): Promise<void> {
    if (!session.value) {
      sessaoAtual.value = null;
      return;
    }
    carregando.value = true;
    erro.value = null;
    try {
      const { data, error: erroSupabase } = await supabase
        .from('cash_sessions')
        .select(SELECT_SESSAO)
        .eq('opened_by', session.value.user.id)
        .eq('status', 'ABERTO')
        .maybeSingle();
      if (erroSupabase) throw erroSupabase;
      sessaoAtual.value = data ? linhaParaSessao(data as SessaoRow) : null;
    } catch (e) {
      erro.value = e instanceof Error ? e.message : 'Não foi possível carregar a sessão de caixa.';
    } finally {
      carregando.value = false;
    }
  }

  /**
   * As duas unique indexes parciais no banco (`cash_sessions_uma_por_caixa_turno_dia`,
   * `cash_sessions_uma_por_usuario`) são a proteção real contra abertura duplicada — aqui só
   * traduz o erro `23505` de cada uma pra uma mensagem que faz sentido pro operador.
   */
  async function abrirSessao(dados: {
    caixa: Caixa;
    turno: Turno;
    lacreAbertura: string;
    maquininhaAbertura: string;
  }): Promise<SessaoCaixa | null> {
    erro.value = null;
    const { data, error: erroSupabase } = await supabase
      .from('cash_sessions')
      .insert({
        caixa: dados.caixa,
        turno: dados.turno,
        business_date: hojeISO(),
        lacre_abertura: dados.lacreAbertura,
        maquininha_abertura: dados.maquininhaAbertura,
      })
      .select(SELECT_SESSAO)
      .single();

    if (erroSupabase) {
      if (erroSupabase.code === '23505') {
        erro.value = erroSupabase.message.includes('cash_sessions_uma_por_usuario')
          ? 'Você já tem uma sessão de caixa aberta — finalize-a antes de abrir outra.'
          : 'Esse caixa já está aberto nesse turno hoje.';
      } else {
        erro.value = erroSupabase.message;
      }
      return null;
    }

    sessaoAtual.value = linhaParaSessao(data as SessaoRow);
    return sessaoAtual.value;
  }

  /**
   * Chamada pelo wizard (`WizardFechamento.vue`) depois que `salvar_fechamento` já foi
   * bem-sucedido. `.select().single()` é proposital (achado do agente de segurança,
   * 18/09/2026): um `update` filtrado pela RLS pra 0 linhas não é erro pro PostgREST — sem
   * pedir a linha de volta, isto ficaria em silêncio dando a entender que a sessão fechou
   * quando na verdade nada mudou no banco.
   */
  async function fecharSessao(sessaoId: string, fechamentoId: string): Promise<void> {
    const { error: erroSupabase } = await supabase
      .from('cash_sessions')
      .update({
        status: 'FECHADO',
        closed_at: new Date().toISOString(),
        closed_by: session.value?.user.id,
        fechamento_id: fechamentoId,
      })
      .eq('id', sessaoId)
      .select('id')
      .single();
    if (erroSupabase) throw erroSupabase;
    if (sessaoAtual.value?.id === sessaoId) sessaoAtual.value = null;
  }

  /** Ação admin (`pages/historico.vue`) pra sessão esquecida — sem fechamento nenhum. */
  async function encerrarSemFechamento(sessaoId: string): Promise<void> {
    const { error: erroSupabase } = await supabase
      .from('cash_sessions')
      .update({
        status: 'FECHADO',
        closed_at: new Date().toISOString(),
        closed_by: session.value?.user.id,
      })
      .eq('id', sessaoId)
      .select('id')
      .single();
    if (erroSupabase) throw erroSupabase;
  }

  return {
    sessaoAtual,
    carregando,
    erro,
    carregarSessaoAtual,
    abrirSessao,
    fecharSessao,
    encerrarSemFechamento,
  };
}
