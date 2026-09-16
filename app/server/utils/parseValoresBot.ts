/**
 * Parsing tolerante dos valores como o bot (`bot_padaria_v3`, ver `integracoes-scripts/`) os
 * produz. O bot serializa tudo pensando na planilha do Google Sheets — números viram string com
 * vírgula decimal ("1234,56"), datas/horas viram string prefixada com aspas simples
 * (`normalizeValue` em `services/recordService.js` do bot, feito para o Sheets não reformatar a
 * célula sozinho) — mas aceitamos também number/ISO puro, para não depender de um detalhe de
 * implementação do bot que pode mudar, e para servir tanto o agente que construímos (que manda
 * JSON limpo) quanto, se um dia apontarem o bot original pra cá, o formato dele tal como é.
 */

/** Remove o prefixo de aspas simples que o bot usa pra forçar texto no Google Sheets. */
function semAspaSimples(valor: string): string {
  return valor.startsWith("'") ? valor.slice(1) : valor;
}

/** "1234,56" | "1234.56" | 1234.56 | "" | null -> number (vazio/nulo = 0). */
export function parseNumeroBot(valor: unknown): number {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const texto = semAspaSimples(String(valor).trim()).replace(',', '.');
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

export function parseInteiroBot(valor: unknown): number {
  return Math.round(parseNumeroBot(valor));
}

/**
 * Como `parseInteiroBot`, mas vazio/ausente vira `null` em vez de 0 — usado pra HORA, onde 0
 * (meia-noite) é um valor real e diferente de "essa linha não tem hora" (linha antiga, turno
 * inteiro). `parseInteiroBot` não serve aqui porque colapsa os dois casos no mesmo 0.
 */
export function parseInteiroOuNuloBot(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const texto = semAspaSimples(String(valor).trim());
  if (!texto) return null;
  return parseInteiroBot(texto);
}

/** "21/08/2026" (formato do bot) | "2026-08-21" | com prefixo de aspa -> "2026-08-21". */
export function parseDataBot(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = semAspaSimples(String(valor).trim());
  if (!texto) return null;

  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

/** "2026-08-21 14:23:00" | ISO | com prefixo de aspa -> ISO (assume fuso America/Sao_Paulo se não vier offset). */
export function parseDataHoraBot(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = semAspaSimples(String(valor).trim());
  if (!texto) return null;

  const semFuso = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(texto);
  const data = new Date(semFuso ? `${texto.replace(' ', 'T')}-03:00` : texto);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}
