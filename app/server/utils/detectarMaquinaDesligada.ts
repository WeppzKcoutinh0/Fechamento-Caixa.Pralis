import { useSupabaseAdmin } from './supabaseAdmin';

/**
 * "A máquina desligou" tem que ser um FATO (pedido do usuário, 28/09/2026) — comparar este caixa
 * contra OS OUTROS caixas do mesmo dia/turno exige ler `vendas_fechamento_caixa_dia` de contas que
 * não são a do operador logado, o que a RLS bloqueia de propósito (decisão de segurança de
 * 18/09/2026: cada caixa só vê o próprio `caixa_padrao`/`turno_padrao`). Por isso roda aqui,
 * server-side, com a chave `service_role` — nunca no cliente.
 */

const LIMIAR_MS = 30 * 60_000; // 30 minutos

interface LinhaResumoCaixa {
  caixa: string | null;
  turno: string | null;
  primeira_venda: string | null;
  ultima_venda: string | null;
}

export interface EventoDetectado {
  descricao: string;
  confirmadoPelosDados: true;
}

export interface ResultadoDeteccaoMaquina {
  eventos: EventoDetectado[];
  temDadosSuficientes: boolean;
}

function formatarHora(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function extremos(linhas: LinhaResumoCaixa[]): { primeira: string | null; ultima: string | null } {
  let primeira: string | null = null;
  let ultima: string | null = null;
  for (const l of linhas) {
    if (l.primeira_venda && (!primeira || l.primeira_venda < primeira)) primeira = l.primeira_venda;
    if (l.ultima_venda && (!ultima || l.ultima_venda > ultima)) ultima = l.ultima_venda;
  }
  return { primeira, ultima };
}

/** `numeroCaixa`/`letraTurno` já vêm convertidos (ver caixaParaNumero/turnoParaLetra no client) —
 * este util não conhece "Caixa 1"/"Manhã", só o formato "1"/"M" que a tabela de vendas usa. */
export async function detectarMaquinaDesligadaPorVendas(
  data: string,
  numeroCaixa: string,
  letraTurno: string,
): Promise<ResultadoDeteccaoMaquina> {
  const supabase = useSupabaseAdmin();
  const { data: linhas, error } = await supabase
    .from('vendas_fechamento_caixa_dia')
    .select('caixa, turno, primeira_venda, ultima_venda')
    .eq('data_venda', data)
    .eq('turno', letraTurno)
    .not('caixa', 'is', null);
  if (error || !linhas) return { eventos: [], temDadosSuficientes: false };

  const doAlvo = (linhas as LinhaResumoCaixa[]).filter((l) => l.caixa === numeroCaixa);
  const dosOutros = (linhas as LinhaResumoCaixa[]).filter((l) => l.caixa !== numeroCaixa);
  if (dosOutros.length === 0) return { eventos: [], temDadosSuficientes: false };

  const outros = extremos(dosOutros);
  const eventos: EventoDetectado[] = [];

  if (doAlvo.length === 0) {
    if (outros.primeira && outros.ultima) {
      eventos.push({
        descricao: `Nenhuma venda registrada neste caixa durante o turno, enquanto os outros caixas venderam normalmente (das ${formatarHora(outros.primeira)} às ${formatarHora(outros.ultima)}).`,
        confirmadoPelosDados: true,
      });
    }
    return { eventos, temDadosSuficientes: true };
  }

  const alvo = extremos(doAlvo);

  if (
    alvo.primeira &&
    outros.primeira &&
    new Date(alvo.primeira).getTime() - new Date(outros.primeira).getTime() > LIMIAR_MS
  ) {
    eventos.push({
      descricao: `Começou a vender às ${formatarHora(alvo.primeira)} — os outros caixas do turno já vendiam desde ${formatarHora(outros.primeira)}.`,
      confirmadoPelosDados: true,
    });
  }

  if (
    alvo.ultima &&
    outros.ultima &&
    new Date(outros.ultima).getTime() - new Date(alvo.ultima).getTime() > LIMIAR_MS
  ) {
    eventos.push({
      descricao: `Parou de vender às ${formatarHora(alvo.ultima)} — os outros caixas continuaram vendendo até ${formatarHora(outros.ultima)}.`,
      confirmadoPelosDados: true,
    });
  }

  return { eventos, temDadosSuficientes: true };
}
