// Portado de services/operadorService.js do bot_padaria_v3 — só a parte pura (interpretarOperador),
// sem a resolução de COLABORADOR via planilha (DE_PARA_OPERADORES), que não existe aqui.
//
// O ERP não entrega a pessoa. O campo OPERADOR é o login do POSTO:
//   'VND CAIXA PDV - 1M'   posto   -> caixa 1, turno M (manhã)
//   'VND CAIXA PDV - 3T'   posto   -> caixa 3, turno T (tarde)
// CAIXA e TURNO saem de graça do próprio texto, sem cadastro nenhum.
import { text } from './hashService.js';

const RE_POSTOS = [
  /^(?:VND\s+)?CAIXA\s+PDV\s*-?\s*([1-4])\s*[-/]?\s*(M|T|MANHA|TARDE)$/i,
  /\bCAIXA\s*(?:PDV\s*)?-?\s*([1-4])\s*[-/]?\s*(M|T|MANHA|TARDE)\b/i,
  /\bPDV\s*-?\s*([1-4])\s*[-/]?\s*(M|T|MANHA|TARDE)\b/i,
];

function normalizarTurno(valor) {
  const turno = String(valor).toUpperCase();
  return turno === 'MANHA' ? 'M' : turno === 'TARDE' ? 'T' : turno;
}

export function interpretarOperador(operador) {
  const nome = text(operador)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const m = RE_POSTOS.map((regex) => nome.match(regex)).find(Boolean);
  if (m) return { natureza: 'posto', caixa: String(Number(m[1])), turno: normalizarTurno(m[2]) };
  return { natureza: 'nominal', caixa: '', turno: '' };
}
