/**
 * Relógio e saudação do painel — portado de `web-vue/utils/saudacao.ts` (Sistema Inteligente
 * Pralís/Cicluz), trocando o import de `FUSO_NEGOCIO` (pacote compartilhado que não existe aqui)
 * pela mesma constante literal já usada em `server/utils/integracaoVendas.ts#diaNegocio`.
 */
const FUSO_NEGOCIO = 'America/Sao_Paulo';

export type FaixaDoDia = 'bom-dia' | 'boa-tarde' | 'boa-noite';

/**
 * Faixas do dia:
 *   05:00 - 11:59   bom dia
 *   12:00 - 17:59   boa tarde
 *   18:00 - 04:59   boa noite
 * A faixa da noite atravessa a meia-noite, por isso é o `else`.
 */
export function faixaDoDia(hora: number): FaixaDoDia {
  if (hora >= 5 && hora < 12) return 'bom-dia';
  if (hora >= 12 && hora < 18) return 'boa-tarde';
  return 'boa-noite';
}

const TEXTO: Record<FaixaDoDia, string> = {
  'bom-dia': 'Bom dia',
  'boa-tarde': 'Boa tarde',
  'boa-noite': 'Boa noite',
};

export function textoDaSaudacao(hora: number): string {
  return TEXTO[faixaDoDia(hora)];
}

/** Hora no fuso do negócio (não o do navegador) — um gerente acessando de outro fuso não deveria
 * ver "Boa noite" enquanto a loja vive a tarde. */
const formatadorHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_NEGOCIO,
  hour: '2-digit',
  hour12: false,
});

export function horaDoNegocio(instante: Date): number {
  return Number(formatadorHora.format(instante));
}

const formatadorRelogio = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_NEGOCIO,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_NEGOCIO,
  weekday: 'long',
  day: '2-digit',
  month: 'long',
});

export interface Relogio {
  hora: string;
  data: string;
  saudacao: string;
}

export function lerRelogio(instante: Date): Relogio {
  return {
    hora: formatadorRelogio.format(instante),
    data: formatadorData.format(instante),
    saudacao: textoDaSaudacao(horaDoNegocio(instante)),
  };
}
