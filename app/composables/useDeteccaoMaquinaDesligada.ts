import type { EventoMaquinaDesligada } from '~/types/fechamento';

/**
 * "A máquina desligou" tem que ser um FATO, não o operador se autodeclarando (pedido do usuário,
 * 28/09/2026) — um navegador não tem como perguntar direto pro Windows "você foi desligado?", mas
 * dá pra MEDIR: enquanto o fechamento está aberto, este composable grava um "sinal de vida"
 * (heartbeat) no aparelho a cada `INTERVALO_MS`. Se, na próxima vez que o sinal for checado
 * (recarregou a página, voltou de segundo plano, ou o próprio intervalo rodou), o tempo desde o
 * ÚLTIMO sinal for maior que `LIMIAR_MS`, isso É a evidência real de que a máquina ficou
 * desligada/travada/hibernada por esse tempo — o próprio sistema mediu, ninguém precisou avisar.
 *
 * Guardado em `localStorage` (sobrevive a reiniciar o navegador/computador, ao contrário do
 * estado em memória do formulário) com chave por `cash_session_id` — a MESMA sessão de caixa,
 * ainda aberta no banco, é o que identifica "este turno" depois de a máquina voltar a ligar.
 */

const INTERVALO_MS = 20_000;
const LIMIAR_MS = 60_000;
const PREFIXO_HEARTBEAT = 'fc-heartbeat-';
const PREFIXO_EVENTOS = 'fc-heartbeat-eventos-';

function lerEventos(chave: string): EventoMaquinaDesligada[] {
  try {
    const bruto = localStorage.getItem(PREFIXO_EVENTOS + chave);
    return bruto ? (JSON.parse(bruto) as EventoMaquinaDesligada[]) : [];
  } catch {
    return [];
  }
}

function salvarEventos(chave: string, eventos: EventoMaquinaDesligada[]): void {
  try {
    localStorage.setItem(PREFIXO_EVENTOS + chave, JSON.stringify(eventos));
  } catch {
    // localStorage indisponível (modo privado, cota cheia) — a detecção simplesmente não
    // persiste entre recarregamentos; não é motivo pra travar o fechamento.
  }
}

export function useDeteccaoMaquinaDesligada() {
  let chaveAtual: string | null = null;
  let intervalo: ReturnType<typeof setInterval> | null = null;
  let aoDetectarCallback: ((eventos: EventoMaquinaDesligada[]) => void) | null = null;

  function verificarGap(): void {
    if (!chaveAtual) return;
    const chaveHb = PREFIXO_HEARTBEAT + chaveAtual;
    const ultimoBruto = localStorage.getItem(chaveHb);
    const agora = Date.now();
    if (ultimoBruto) {
      const ultimo = Number(ultimoBruto);
      const gap = agora - ultimo;
      if (gap > LIMIAR_MS) {
        const eventos = lerEventos(chaveAtual);
        eventos.push({
          inicio: new Date(ultimo).toISOString(),
          fim: new Date(agora).toISOString(),
          motivos: [],
          outroTexto: '',
        });
        salvarEventos(chaveAtual, eventos);
        aoDetectarCallback?.(eventos);
      }
    }
    localStorage.setItem(chaveHb, String(agora));
  }

  /**
   * Liga o heartbeat pra `chave` (o `cash_session_id`). Chama `aoDetectar` toda vez que a lista
   * de eventos detectados mudar (inclusive na primeira checagem, se já havia um gap esperando).
   */
  function iniciar(chave: string, aoDetectar: (eventos: EventoMaquinaDesligada[]) => void): void {
    parar();
    chaveAtual = chave;
    aoDetectarCallback = aoDetectar;
    verificarGap();
    intervalo = setInterval(verificarGap, INTERVALO_MS);
    // Sleep/hibernação pausa o setInterval — ao voltar o foco, checa na hora em vez de esperar
    // até 20s pelo próximo tick, pra não perder o momento exato de quando voltou.
    window.addEventListener('focus', verificarGap);
    document.addEventListener('visibilitychange', verificarGap);
  }

  function parar(): void {
    if (intervalo) clearInterval(intervalo);
    intervalo = null;
    window.removeEventListener('focus', verificarGap);
    document.removeEventListener('visibilitychange', verificarGap);
  }

  /** Chamado depois que o fechamento salva com sucesso — este turno acabou, não precisa mais
   * detectar nada pra essa sessão. */
  function limpar(chave: string): void {
    localStorage.removeItem(PREFIXO_HEARTBEAT + chave);
    localStorage.removeItem(PREFIXO_EVENTOS + chave);
  }

  return { iniciar, parar, limpar, lerEventos, salvarEventos };
}
